from __future__ import annotations

import json
import re
import unittest
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


CONTRACTS = Path(__file__).resolve().parents[1]
OPENAPI = CONTRACTS / "openapi"
EVENTS = CONTRACTS / "events"
EXAMPLES = CONTRACTS / "examples" / "events"


class ContractValidationError(AssertionError):
    pass


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def resolve_pointer(document: Any, fragment: str) -> Any:
    current = document
    if not fragment:
        return current
    if not fragment.startswith("/"):
        raise ContractValidationError(f"Unsupported JSON pointer: #{fragment}")
    for raw_part in fragment[1:].split("/"):
        part = raw_part.replace("~1", "/").replace("~0", "~")
        current = current[int(part)] if isinstance(current, list) else current[part]
    return current


def resolve_ref(ref: str, document: Any, document_path: Path) -> tuple[Any, Any, Path]:
    if ref.startswith("#"):
        return resolve_pointer(document, ref[1:]), document, document_path
    file_name, separator, fragment = ref.partition("#")
    target_path = (document_path.parent / file_name).resolve()
    if not target_path.is_file():
        raise ContractValidationError(f"Reference target does not exist: {ref}")
    target_document = load_json(target_path)
    target = resolve_pointer(target_document, fragment) if separator else target_document
    return target, target_document, target_path


def assert_format(value: str, format_name: str, location: str) -> None:
    if format_name == "uuid":
        try:
            uuid.UUID(value)
        except ValueError as exc:
            raise ContractValidationError(f"{location}: invalid UUID") from exc
    elif format_name == "email":
        if "@" not in value or value.startswith("@") or value.endswith("@"):
            raise ContractValidationError(f"{location}: invalid email")
    elif format_name == "uri":
        if not urlparse(value).scheme:
            raise ContractValidationError(f"{location}: invalid URI")
    elif format_name == "date-time":
        try:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ContractValidationError(f"{location}: invalid date-time") from exc


def validate(
    instance: Any,
    schema: Any,
    document: Any,
    document_path: Path,
    location: str = "$",
) -> None:
    if schema is True or schema == {}:
        return
    if schema is False:
        raise ContractValidationError(f"{location}: schema rejects every value")
    if "$ref" in schema:
        target, target_document, target_path = resolve_ref(
            schema["$ref"], document, document_path
        )
        validate(instance, target, target_document, target_path, location)
    for member in schema.get("allOf", []):
        validate(instance, member, document, document_path, location)
    if "const" in schema and instance != schema["const"]:
        raise ContractValidationError(f"{location}: expected constant {schema['const']!r}")
    if "enum" in schema and instance not in schema["enum"]:
        raise ContractValidationError(f"{location}: value is outside enum")

    expected_types = schema.get("type")
    if expected_types is not None:
        if isinstance(expected_types, str):
            expected_types = [expected_types]
        matches = any(type_matches(instance, expected) for expected in expected_types)
        if not matches:
            raise ContractValidationError(
                f"{location}: expected {expected_types}, got {type(instance).__name__}"
            )

    if isinstance(instance, dict):
        required = schema.get("required", [])
        missing = [name for name in required if name not in instance]
        if missing:
            raise ContractValidationError(f"{location}: missing required {missing}")
        properties = schema.get("properties", {})
        additional = schema.get("additionalProperties", True)
        for name, value in instance.items():
            child_location = f"{location}.{name}"
            if name in properties:
                validate(value, properties[name], document, document_path, child_location)
            elif additional is False:
                raise ContractValidationError(f"{child_location}: unexpected property")
            elif isinstance(additional, dict):
                validate(value, additional, document, document_path, child_location)

    if isinstance(instance, list):
        if "minItems" in schema and len(instance) < schema["minItems"]:
            raise ContractValidationError(f"{location}: too few items")
        if "maxItems" in schema and len(instance) > schema["maxItems"]:
            raise ContractValidationError(f"{location}: too many items")
        item_schema = schema.get("items", {})
        for index, value in enumerate(instance):
            validate(value, item_schema, document, document_path, f"{location}[{index}]")

    if isinstance(instance, str):
        if len(instance) < schema.get("minLength", 0):
            raise ContractValidationError(f"{location}: string is too short")
        if len(instance) > schema.get("maxLength", float("inf")):
            raise ContractValidationError(f"{location}: string is too long")
        if "pattern" in schema and not re.search(schema["pattern"], instance):
            raise ContractValidationError(f"{location}: pattern mismatch")
        if "format" in schema:
            assert_format(instance, schema["format"], location)

    if isinstance(instance, (int, float)) and not isinstance(instance, bool):
        if instance < schema.get("minimum", float("-inf")):
            raise ContractValidationError(f"{location}: below minimum")
        if instance > schema.get("maximum", float("inf")):
            raise ContractValidationError(f"{location}: above maximum")


def type_matches(instance: Any, expected: str) -> bool:
    return {
        "object": isinstance(instance, dict),
        "array": isinstance(instance, list),
        "string": isinstance(instance, str),
        "integer": isinstance(instance, int) and not isinstance(instance, bool),
        "number": isinstance(instance, (int, float)) and not isinstance(instance, bool),
        "boolean": isinstance(instance, bool),
        "null": instance is None,
    }.get(expected, False)


def walk_refs(node: Any):
    if isinstance(node, dict):
        if "$ref" in node:
            yield node["$ref"]
        for value in node.values():
            yield from walk_refs(value)
    elif isinstance(node, list):
        for value in node:
            yield from walk_refs(value)


def media_examples(media: dict[str, Any]):
    if "example" in media:
        yield media["example"]
    for example in media.get("examples", {}).values():
        if "value" in example:
            yield example["value"]


def validate_openapi_examples(document: dict[str, Any], path: Path) -> int:
    validated = 0
    for path_item in document["paths"].values():
        for method, operation in path_item.items():
            if method not in {"get", "post", "put", "patch", "delete"}:
                continue
            request_body = operation.get("requestBody")
            if request_body:
                if "$ref" in request_body:
                    request_body, _, _ = resolve_ref(request_body["$ref"], document, path)
                for media in request_body.get("content", {}).values():
                    for example in media_examples(media):
                        validate(example, media["schema"], document, path)
                        validated += 1
            for response in operation.get("responses", {}).values():
                response_document = document
                response_path = path
                if "$ref" in response:
                    response, response_document, response_path = resolve_ref(
                        response["$ref"], document, path
                    )
                for media in response.get("content", {}).values():
                    for example in media_examples(media):
                        validate(
                            example,
                            media["schema"],
                            response_document,
                            response_path,
                        )
                        validated += 1
    return validated


def validate_message_semantics(event: dict[str, Any]) -> None:
    payload = event["payload"]
    if payload["senderUserId"] == payload["recipientUserId"]:
        raise ContractValidationError("senderUserId and recipientUserId must differ")
    if payload["sentAt"] > event["occurredAt"]:
        raise ContractValidationError("sentAt cannot be after occurredAt")


class OpenApiContractsTest(unittest.TestCase):
    def test_openapi_documents_and_references(self) -> None:
        files = sorted(OPENAPI.glob("*.json"))
        self.assertEqual(3, len(files))
        for path in files:
            with self.subTest(path=path.name):
                document = load_json(path)
                self.assertEqual("3.1.0", document["openapi"])
                self.assertEqual(
                    "draft-pending-team-approval", document["x-contract-status"]
                )
                self.assertTrue(document["paths"])
                for ref in walk_refs(document):
                    resolve_ref(ref, document, path)

    def test_only_health_is_marked_implemented(self) -> None:
        for path in sorted(OPENAPI.glob("*.json")):
            document = load_json(path)
            for route, path_item in document["paths"].items():
                for method, operation in path_item.items():
                    if method not in {"get", "post", "put", "patch", "delete"}:
                        continue
                    expected = "implemented" if route == "/health" else "proposed"
                    self.assertEqual(expected, operation["x-implementation-status"])

    def test_openapi_examples_match_their_schemas(self) -> None:
        count = 0
        for path in sorted(OPENAPI.glob("*.json")):
            count += validate_openapi_examples(load_json(path), path)
        self.assertGreaterEqual(count, 10)

    def test_catalog_uses_angular_compatible_pagination_and_filter_name(self) -> None:
        document = load_json(OPENAPI / "catalog.json")
        operation = document["paths"]["/v1/publicaciones"]["get"]
        parameter_names = {
            parameter.get("name")
            for parameter in operation["parameters"]
            if "$ref" not in parameter
        }
        self.assertIn("sortDirection", parameter_names)
        self.assertNotIn("sortDir", parameter_names)
        page = document["components"]["schemas"]["PublicationPageV1"]
        self.assertEqual(
            {"items", "totalRecords", "page", "pageSize"}, set(page["required"])
        )


class EventContractsTest(unittest.TestCase):
    def test_event_schemas_declare_draft_2020_12(self) -> None:
        for path in sorted(EVENTS.glob("*.schema.json")):
            with self.subTest(path=path.name):
                schema = load_json(path)
                self.assertEqual(
                    "https://json-schema.org/draft/2020-12/schema", schema["$schema"]
                )
                self.assertIn("$id", schema)

    def test_valid_message_sent_example(self) -> None:
        schema_path = EVENTS / "message-sent.v1.schema.json"
        schema = load_json(schema_path)
        event = load_json(EXAMPLES / "message.sent.v1.valid.json")
        validate(event, schema, schema, schema_path)
        validate_message_semantics(event)

    def test_invalid_message_sent_examples_are_rejected(self) -> None:
        schema_path = EVENTS / "message-sent.v1.schema.json"
        schema = load_json(schema_path)
        invalid_files = sorted((EXAMPLES / "invalid").glob("*.json"))
        self.assertGreaterEqual(len(invalid_files), 3)
        for path in invalid_files:
            with self.subTest(path=path.name):
                event = load_json(path)
                with self.assertRaises(ContractValidationError):
                    validate(event, schema, schema, schema_path)
                    validate_message_semantics(event)

    def test_recipient_is_required_and_unambiguous(self) -> None:
        event = load_json(EXAMPLES / "message.sent.v1.valid.json")
        self.assertTrue(event["payload"]["recipientUserId"])
        self.assertNotEqual(
            event["payload"]["senderUserId"], event["payload"]["recipientUserId"]
        )
        self.assertLessEqual(event["occurredAt"], 9_999_999_999)
        self.assertLessEqual(event["payload"]["sentAt"], 9_999_999_999)


if __name__ == "__main__":
    unittest.main()

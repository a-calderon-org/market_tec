from __future__ import annotations

import json
import unittest
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from referencing import Registry, Resource


CONTRACTS = Path(__file__).resolve().parents[1]
EVENTS = CONTRACTS / "events"
EXAMPLES = CONTRACTS / "examples" / "events"


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def message_sent_validator() -> Draft202012Validator:
    common_schema = load_json(EVENTS / "common-event-envelope.schema.json")
    message_schema = load_json(EVENTS / "message-sent.v1.schema.json")
    registry = Registry().with_resource(
        common_schema["$id"], Resource.from_contents(common_schema)
    )
    return Draft202012Validator(
        message_schema,
        registry=registry,
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


class FormalJsonSchemaValidationTest(unittest.TestCase):
    def test_event_schemas_are_valid_draft_2020_12(self) -> None:
        for path in sorted(EVENTS.glob("*.schema.json")):
            with self.subTest(path=path.name):
                Draft202012Validator.check_schema(load_json(path))

    def test_valid_message_sent_example_passes_formal_validation(self) -> None:
        validator = message_sent_validator()
        validator.validate(load_json(EXAMPLES / "message.sent.v1.valid.json"))

    def test_schema_invalid_examples_fail_formal_validation(self) -> None:
        validator = message_sent_validator()
        invalid_files = (
            "message.sent.v1.milliseconds.json",
            "message.sent.v1.missing-recipient.json",
        )
        for file_name in invalid_files:
            with self.subTest(path=file_name):
                self.assertFalse(
                    validator.is_valid(load_json(EXAMPLES / "invalid" / file_name))
                )

    def test_cross_field_negative_remains_a_semantic_check(self) -> None:
        validator = message_sent_validator()
        event = load_json(
            EXAMPLES / "invalid" / "message.sent.v1.same-participant.json"
        )
        self.assertTrue(validator.is_valid(event))


if __name__ == "__main__":
    unittest.main()

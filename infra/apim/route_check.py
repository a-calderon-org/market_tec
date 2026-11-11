"""Deterministic end-to-end route check: Angular -> APIM host -> API suffix -> operation -> rewrite -> ms-users.

Angular builds every ms-users URL with `versionedApiUrl(environment.apiBaseUrl, versionlessPath)`
(app/frontend/src/app/core/api/api-url.ts). This module mirrors that rule and resolves each call the
browser makes through a candidate APIM API (suffix + operation url templates + rewrite-uri) to the
backend URL, so a missing `/v1`, a doubled `/v1/v1`, swapped login/registration routes, a wrong
rewrite or a profile call sent to another backend fail here instead of in a browser.

Local check only: it proves the configuration is consistent, not that Azure routes it that way.
"""
import re
from urllib.parse import urlsplit

# What the Angular client calls for each released operation: (method, versionless path, Java path).
# Source: core/auth/v2/http-auth-api.adapter.ts and features/profile/services/user.service.ts.
EXPECTED_CALLS = {
    "createAuthenticationAttempt": ("POST", "/auth/attempts", "/v1/auth/attempts"),
    "exchangeGoogleCredential": ("POST", "/auth/google", "/v1/auth/google"),
    "legacyGoogleRegistrationCompatibility": ("POST", "/auth/google/registrations", "/v1/auth/google/registrations"),
    "requestInstitutionalEmailLink": ("POST", "/auth/email/requests", "/v1/auth/email/requests"),
    "confirmInstitutionalEmailLink": ("POST", "/auth/email/confirm", "/v1/auth/email/confirm"),
    "getSessionState": ("GET", "/auth/session", "/v1/auth/session"),
    "refreshSession": ("POST", "/auth/refresh", "/v1/auth/refresh"),
    "logoutSession": ("POST", "/auth/logout", "/v1/auth/logout"),
    "getOwnUserProfile": ("GET", "/me/profile", "/v1/me/profile"),
    "updateOwnUserProfile": ("PUT", "/me/profile", "/v1/me/profile"),
}

# Password extension (contracts/openapi/users-password.json). Source: http-auth-api.adapter.ts (login, recovery) and
# password-credentials.service.ts (status, first password). The profile calls PUT /me/password
# (change with the current password).
PASSWORD_CALLS = {
    "loginWithPassword": ("POST", "/auth/password/login", "/v1/auth/password/login"),
    "requestPasswordRecoveryLink": ("POST", "/auth/password/recovery/requests", "/v1/auth/password/recovery/requests"),
    "getOwnPasswordStatus": ("GET", "/me/password", "/v1/me/password"),
    "setOwnInitialPassword": ("POST", "/me/password", "/v1/me/password"),
    "changeOwnPassword": ("PUT", "/me/password", "/v1/me/password"),
    # Source: core/auth/v2/auth-methods.service.ts (profile: real access method of the account).
    "getOwnAuthMethods": ("GET", "/me/auth-methods", "/v1/me/auth-methods"),
}


def expected_calls(operation_ids) -> dict:
    """Expected calls for exactly these released operations; an operation without a known call is refused."""
    known = {**EXPECTED_CALLS, **PASSWORD_CALLS}
    missing = [op for op in operation_ids if op not in known]
    if missing:
        raise ValueError(f"no expected client call for released operations: {missing}")
    return {op: known[op] for op in operation_ids}


class RouteError(ValueError):
    """The route chain does not reach the expected ms-users endpoint."""


def versioned_api_url(configured_base_url: str, versionless_path: str) -> str:
    """Python mirror of Angular `versionedApiUrl` (base ending in /v1 is not doubled)."""
    base = configured_base_url.strip().rstrip("/")
    path = versionless_path if versionless_path.startswith("/") else "/" + versionless_path
    return f"{base}{path}" if re.search(r"/v1$", base) else f"{base}/v1{path}"


def _template(url_template: str) -> re.Pattern:
    parts = re.split(r"(\{[A-Za-z0-9]+\})", url_template)
    return re.compile("".join("[^/]+" if p.startswith("{") else re.escape(p) for p in parts))


def _origin(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"


def resolve(api_base_url: str, gateway_origin: str, api_path: str, definitions: list, service_urls: dict,
            users_service_url: str, expected: dict = None) -> list:
    """Resolve every expected Angular call; raise RouteError listing every broken link.

    definitions: [{id, method, url_template, backend_path}] as generated for the candidate API.
    service_urls: {operation id: backend service URL APIM forwards to}.
    """
    expected = EXPECTED_CALLS if expected is None else expected
    problems, table = [], []
    prefix = "/" + api_path.strip("/")
    if _origin(api_base_url) != gateway_origin.rstrip("/"):
        problems.append(f"apiBaseUrl {api_base_url} is not on the APIM gateway {gateway_origin}")
    for op_id, (method, versionless, java_path) in expected.items():
        url = versioned_api_url(api_base_url, versionless)
        path = urlsplit(url).path
        if "/v1/v1" in path:
            problems.append(f"{op_id}: duplicated /v1 in public URL {url}")
            continue
        if not path.startswith(prefix + "/"):
            problems.append(f"{op_id}: {url} is outside the API suffix {prefix}")
            continue
        remainder = path[len(prefix):]
        matches = [d for d in definitions if d["method"] == method and _template(d["url_template"]).fullmatch(remainder)]
        if len(matches) != 1:
            problems.append(f"{op_id}: {method} {remainder} matches {len(matches)} APIM operations"
                            + (" (missing /v1 in suffix or template?)" if not matches else ""))
            continue
        match = matches[0]
        if match["id"] != op_id:
            problems.append(f"{op_id}: {method} {url} is routed to {match['id']}")
            continue
        service = service_urls.get(op_id, "").rstrip("/")
        if service != users_service_url.rstrip("/"):
            problems.append(f"{op_id}: forwarded to {service or 'no backend'}, not ms-users {users_service_url}")
            continue
        backend = service + match["backend_path"]
        backend_path = urlsplit(backend).path
        if "/v1/v1" in backend_path:
            problems.append(f"{op_id}: duplicated /v1 in backend URL {backend}")
        elif backend_path != java_path:
            problems.append(f"{op_id}: rewrite reaches {backend_path}, ms-users serves {java_path}")
        else:
            table.append({"id": op_id, "method": method, "browser_url": url, "apim_operation": match["url_template"],
                          "backend_url": backend})
    if problems:
        raise RouteError("; ".join(problems))
    return table

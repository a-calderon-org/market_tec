"""Reviewed release profiles: which operations a candidate APIM surface may route at all.

A profile only *narrows* what security_reference.py and the approvals allow. It never lifts a block:
an operation outside the profile gets a terminal deny, and an operation inside it is still denied
while its approval (abuse protection, B07 contract) is missing. Like security_reference.py this is
code, not editable data, so widening a release needs a reviewed change here.

The API definition is a *candidate* for a separate APIM API (MTEC-41): the browser must not need an
APIM subscription key, and the shared API `markettec-api-v1` keeps `subscriptionRequired=true` for
the services that still depend on it. Nothing here is applied to Azure.
"""

RELEASE_PROFILES = {
    "ms-users-google-v1": {
        "description": "Google login/registration, institutional Magic Link login, session, refresh, logout and own "
                       "profile (MTEC-12/MTEC-41)",
        # Ten HTTP operations, nine functional capabilities. The profile name is kept for operator continuity.
        "operations": (
            "createAuthenticationAttempt",            # POST /v1/auth/attempts
            "exchangeGoogleCredential",               # POST /v1/auth/google
            "legacyGoogleRegistrationCompatibility",  # POST /v1/auth/google/registrations
            "requestInstitutionalEmailLink",          # POST /v1/auth/email/requests
            "confirmInstitutionalEmailLink",          # POST /v1/auth/email/confirm
            "getSessionState",                        # GET  /v1/auth/session
            "refreshSession",                         # POST /v1/auth/refresh
            "logoutSession",                          # POST /v1/auth/logout
            "getOwnUserProfile",                      # GET  /v1/me/profile
            "updateOwnUserProfile",                   # PUT  /v1/me/profile
        ),
        "api": {
            # Proposed name and suffix; the operator may choose others (route_check.py verifies the chain).
            "name": "markettec-users-v1",
            "path": "users/v1",
            "protocols": ["https"],
            "subscriptionRequired": False,
            # ms-users controllers already carry /v1: the backend URL must be the bare origin.
            "service_url_path": "",
        },
        # Headers the browser sends to these operations (Angular HttpAuthApiAdapter / UserService).
        "cors_allowed_headers": ("Content-Type", "Authorization", "X-CSRF-Token", "X-MTEC-Client",
                                 "X-Correlation-ID"),
        "cors_allowed_methods": ("GET", "POST", "PUT"),
    },
}

# Institutional password (ms-users 8707f03, contracts/openapi/users-password.json). The ten operations above plus
# the five password operations and the read-only own auth-methods list; same API, headers and methods. Needs `--openapi-extension`; the password rows stay
# terminal denials until `ms_users_contract` (and, for login/recovery, `abuse_protection`) evidence exists.
RELEASE_PROFILES["ms-users-password-v1"] = {
    "description": "ms-users-google-v1 plus institutional email + password sign-in, recovery link request, own "
                   "password status, first password and password change (users-password extension)",
    "operations": RELEASE_PROFILES["ms-users-google-v1"]["operations"] + (
        "loginWithPassword",            # POST /v1/auth/password/login
        "requestPasswordRecoveryLink",  # POST /v1/auth/password/recovery/requests
        "getOwnPasswordStatus",         # GET  /v1/me/password
        "setOwnInitialPassword",        # POST /v1/me/password
        "changeOwnPassword",            # PUT  /v1/me/password
        # Read-only list of the account's linked identities (users.json, reconciled): the profile shows the real
        # access method and offers password controls only to accounts with local credentials.
        "getOwnAuthMethods",            # GET  /v1/me/auth-methods
    ),
    "api": dict(RELEASE_PROFILES["ms-users-google-v1"]["api"]),
    "cors_allowed_headers": RELEASE_PROFILES["ms-users-google-v1"]["cors_allowed_headers"],
    "cors_allowed_methods": RELEASE_PROFILES["ms-users-google-v1"]["cors_allowed_methods"],
}

NOT_RELEASED = (404, "Not Found", "OPERATION_NOT_RELEASED")


def profile(name: str) -> dict:
    if name not in RELEASE_PROFILES:
        raise ValueError(f"unknown release profile {name}")
    return RELEASE_PROFILES[name]

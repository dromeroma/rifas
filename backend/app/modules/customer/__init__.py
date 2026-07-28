"""customer — módulo núcleo del dominio de Savvy Perks.

Un Customer es la representación unificada del cliente final del
tenant. Todo lo demás (wallets, rewards, campaigns, rules) gira
alrededor de él.

Superficie pública:

  Modelos ORM:
    CustomerIdentity, CustomerPreference, CustomerConsent
    IdentityKind, NotificationChannel, ConsentAction

  DTOs Pydantic:
    IdentityIn, IdentityOut
    PreferenceIn, PreferenceOut
    ConsentIn, ConsentOut
    IdentifyRequest, IdentifyResult

  Service:
    find_by_identity, add_identity, verify_identity, list_identities
    identify (find-or-create)
    set_preference, get_preferences
    grant_consent, revoke_consent, latest_consent, record_consent

  Errores:
    CustomerModuleError, CustomerNotFoundError,
    IdentityConflictError, InvalidIdentityValueError

  Eventos publicados (constantes canónicas en `events`):
    customer.identified, customer.identity.added,
    customer.identity.verified, customer.profile.updated,
    customer.consent.granted, customer.consent.revoked,
    customer.merged

Ver docs/02-DOMAIN.md sección "Customer (núcleo)".
"""
from app.modules.customer import events
from app.modules.customer.errors import (
    CustomerModuleError,
    CustomerNotFoundError,
    IdentityConflictError,
    InvalidIdentityValueError,
)
from app.modules.customer.models import (
    ConsentAction,
    CustomerConsent,
    CustomerIdentity,
    CustomerPreference,
    IdentityKind,
    NotificationChannel,
)
from app.modules.customer.schemas import (
    ConsentIn,
    ConsentOut,
    IdentifyRequest,
    IdentifyResult,
    IdentityIn,
    IdentityOut,
    PreferenceIn,
    PreferenceOut,
)
from app.modules.customer.service import (
    add_identity,
    find_by_identity,
    get_preferences,
    grant_consent,
    identify,
    latest_consent,
    list_identities,
    record_consent,
    revoke_consent,
    set_preference,
    verify_identity,
)

__all__ = [
    "ConsentAction",
    "ConsentIn",
    "ConsentOut",
    "CustomerConsent",
    "CustomerIdentity",
    "CustomerModuleError",
    "CustomerNotFoundError",
    "CustomerPreference",
    "IdentifyRequest",
    "IdentifyResult",
    "IdentityConflictError",
    "IdentityIn",
    "IdentityKind",
    "IdentityOut",
    "InvalidIdentityValueError",
    "NotificationChannel",
    "PreferenceIn",
    "PreferenceOut",
    "add_identity",
    "events",
    "find_by_identity",
    "get_preferences",
    "grant_consent",
    "identify",
    "latest_consent",
    "list_identities",
    "record_consent",
    "revoke_consent",
    "set_preference",
    "verify_identity",
]

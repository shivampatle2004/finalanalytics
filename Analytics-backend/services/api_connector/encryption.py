from services.credentials_crypto import decrypt_secret, encrypt_secret


def encrypt_auth_config(auth_config: dict | None) -> dict:
    cfg = dict(auth_config or {})
    for k in ("api_key_value", "token", "password"):
        if cfg.get(k):
            cfg[k] = encrypt_secret(str(cfg[k]))
    return cfg


def decrypt_auth_config(auth_config: dict | None) -> dict:
    cfg = dict(auth_config or {})
    for k in ("api_key_value", "token", "password"):
        if cfg.get(k):
            try:
                cfg[k] = decrypt_secret(str(cfg[k]))
            except Exception:
                cfg[k] = ""
    return cfg


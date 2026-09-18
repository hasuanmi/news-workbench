import hashlib


def url_hash(url: str) -> str:
    return hashlib.sha256(url.strip().encode("utf-8")).hexdigest()


def content_hash(content: str) -> str:
    return hashlib.sha256((content or "").encode("utf-8")).hexdigest()


def is_duplicate(cur_hash: str, existing_hash: str) -> bool:
    """URL 相同即视为重复；content 相同视为换标题重发（也判重）。"""
    return cur_hash == existing_hash

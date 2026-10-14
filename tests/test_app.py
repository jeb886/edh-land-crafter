from app import create_app


def client():
    return create_app().test_client()


def test_health():
    res = client().get("/api/health")
    assert res.status_code == 200
    assert res.get_json() == {"status": "ok"}


def test_index():
    res = client().get("/")
    assert res.status_code == 200
    assert b"EDH Land Crafter" in res.data

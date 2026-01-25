from apps.api.http.response import Response, ResponseModel


def test_response_success() -> None:
    payload = Response.success(data={"id": 1}, message="ok")

    assert isinstance(payload, ResponseModel)
    assert payload.message == "ok"
    assert payload.error is None
    assert payload.data == {"id": 1}
    assert payload.timestamp > 0


def test_response_fail() -> None:
    payload = Response.fail(message="bad", data={"id": 2})

    assert payload.message == "bad"
    assert payload.error is None
    assert payload.data == {"id": 2}
    assert payload.timestamp > 0

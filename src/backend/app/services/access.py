from ipaddress import ip_address

from fastapi import HTTPException, Request, status

from app.models.user import User


def require_org_admin(user: User) -> None:
    if user.role != "org_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required.")


def client_ip(request: Request) -> str:
    # The private nginx proxy overwrites X-Real-IP with the originating client address.
    forwarded_ip = request.headers.get("x-real-ip", "")
    try:
        return str(ip_address(forwarded_ip))
    except ValueError:
        return request.client.host if request.client is not None else "unknown"

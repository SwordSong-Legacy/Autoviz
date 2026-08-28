"""Authentication routes: register, login, and current user"""

from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm

from app.api.deps import UserSvc, get_current_user
from app.core.exceptions import AuthenticationError
from app.core.security import create_access_token
from app.db.models.user import User
from app.schemas.user import Token, UserCreate, UserRead

router = APIRouter(prefix="/auth")


@router.get("/me", response_model=UserRead)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user."""
    return current_user


@router.post("/register", response_model=UserRead, status_code=201)
async def register(user_in: UserCreate, user_service: UserSvc):
    """Register a new user"""
    user = await user_service.create(user_in)
    return user


@router.post("/login", response_model=Token)
async def login(
    user_service: UserSvc,
    form_data: OAuth2PasswordRequestForm = Depends(),
):
    """Login a user"""
    user = await user_service.authenticate(form_data.username, form_data.password)
    if not user:
        raise AuthenticationError(message="Invalid credentials")
    token = create_access_token(subject=str(user.id))
    return Token(access_token=token)

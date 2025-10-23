import os
import secrets
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, relationship, declarative_base 
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey
from sqlalchemy.orm import sessionmaker
from pydantic import BaseModel
from typing import List, Optional
from urllib.parse import urlparse
from bs4 import BeautifulSoup
import requests 

# --- 認証関連のライブラリ ---
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from fastapi.security import OAuth2PasswordBearer
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from dotenv import load_dotenv

# .envファイルを読み込む
load_dotenv() 

# --- 1. データベース接続設定 ---
# Docker Compose の設定と一致させる
DB_USER = "user"
DB_PASSWORD = "password"
DB_HOST = "db" # コンテナ内のDBサービス名を指定
DB_NAME = "mydatabase"
DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}"

# 環境変数から設定を読み込む (またはデフォルト値を設定)
SECRET_KEY = os.getenv("SECRET_KEY", "your-super-secret-key-that-you-should-change")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "259161621393-o03dfii4surg86prhosis9gu6a7aj231.apps.googleusercontent.com")

try:
    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base = declarative_base()
except Exception as e:
    # Docker起動時にDBが利用不可でも起動を試みるため、エラーはログに留める
    print(f"Database connection error during initialization: {e}")

# --- 認証関連のグローバル設定 ---
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # トークン有効期限を7日間に設定
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/google")

# --- 2. データベースのモデル定義 ---
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    google_id = Column(String, unique=True, index=True)
    categories = relationship("Category", back_populates="owner", cascade="all, delete-orphan")

class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    display_order = Column(Integer, default=0)
    user_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="categories")
    sites = relationship("Site", back_populates="category", cascade="all, delete-orphan", order_by="Site.display_order")

class Site(Base):
    __tablename__ = "sites"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    url = Column(String, index=True)
    favicon_url = Column(String, nullable=True)
    display_order = Column(Integer, default=0)
    category_id = Column(Integer, ForeignKey("categories.id"))
    category = relationship("Category", back_populates="sites")

# --- 3. Pydanticスキーマ定義 (変更なし) ---
class Token(BaseModel):
    access_token: str
    token_type: str

class GoogleLoginRequest(BaseModel):
    token: str

class UserResponse(BaseModel):
    id: int
    email: str
    class Config:
        from_attributes = True

class SiteBase(BaseModel):
    url: str
    title: Optional[str] = None
class SiteCreate(SiteBase):
    category_id: int
class SiteUpdate(BaseModel):
    title: str
class SiteResponse(SiteBase):
    id: int
    favicon_url: Optional[str] = None
    display_order: int
    class Config:
        from_attributes = True
class CategoryBase(BaseModel):
    name: str
class CategoryCreate(CategoryBase):
    pass
class CategoryUpdate(CategoryBase):
    pass
class CategoryResponse(CategoryBase):
    id: int
    display_order: int
    sites: List[SiteResponse] = []
    class Config:
        from_attributes = True
class OrderUpdateRequest(BaseModel):
    id: int
    order: int
class MoveSiteRequest(BaseModel):
    site_id: int
    new_category_id: int

# --- 4. データベースのテーブル作成 (DBが利用可能になるまで待つ必要があるため、ここで呼び出す) ---
def init_db():
    Base.metadata.create_all(bind=engine)

app = FastAPI()

# --- CORS設定 (変更なし) ---
origins = [ 
    "http://localhost:5173", 
    "http://localhost:5175",  
    "http://127.0.0.1:5175",  
    "chrome-extension://*" 
]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# --- DBセッションの依存関係 (変更なし) ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- 認証関連のヘルパー関数 (変更なし) ---
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("user_id")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user

# --- DB初期化のライフサイクルイベント ---
@app.on_event("startup")
def on_startup():
    print("Initializing database...")
    # Docker環境では起動時にDB接続が不安定な場合があるため、リトライ処理を入れることが望ましいが、今回はシンプルにinit_dbを呼び出す
    try:
        init_db()
        print("Database initialized successfully.")
    except Exception as e:
        print(f"Could not initialize database. Please check DB connection: {e}")


# --- 5. APIエンドポイント (Google認証用、CRUD、スクレイピング) ---
@app.get("/")
def read_root():
    return {"message": "Welcome to Tab Manager API", "status": "running"}

@app.post("/api/auth/google", response_model=Token)
def google_login(request: GoogleLoginRequest, db: Session = Depends(get_db)):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google Client ID is not configured on the server",
        )
    try:
        # Google ID Tokenの検証
        idinfo = id_token.verify_oauth2_token(request.token, google_requests.Request(), GOOGLE_CLIENT_ID)
        google_id = idinfo['sub']
        email = idinfo['email']
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token",
        )

    user = db.query(User).filter(User.google_id == google_id).first()
    
    is_new_user = False
    if not user:
        # 新規ユーザー登録
        user = User(google_id=google_id, email=email)
        db.add(user)
        db.commit()
        db.refresh(user)
        is_new_user = True
        
    # ⭐ 修正/追記: 新規ユーザーの場合、初期カテゴリを作成する
    if is_new_user:
        initial_category = db.query(Category).filter(Category.user_id == user.id).first()
        if not initial_category:
            db_category = Category(name="未分類", display_order=0, user_id=user.id)
            db.add(db_category)
            db.commit()
            # db.refresh(db_category) # refreshは不要
            print(f"INFO: Created initial category for user {user.id}")

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(data={"sub": user.email, "user_id": user.id}, expires_delta=access_token_expires)
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/users/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

# --- カテゴリとサイトの CRUD エンドポイント (認証付き、ロジック変更なし) ---
@app.get("/api/categories", response_model=List[CategoryResponse])
def read_categories(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Category).filter(Category.user_id == current_user.id).order_by(Category.display_order).all()

@app.post("/api/categories", response_model=CategoryResponse)
def create_category(category: CategoryCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    max_order = db.query(Category).filter(Category.user_id == current_user.id).count()
    db_category = Category(name=category.name, display_order=max_order, user_id=current_user.id)
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category

@app.put("/api/categories/{category_id}", response_model=CategoryResponse)
def update_category(category_id: int, category: CategoryUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_category = db.query(Category).filter(Category.id == category_id, Category.user_id == current_user.id).first()
    if db_category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    db_category.name = category.name
    db.commit()
    db.refresh(db_category)
    return db_category

@app.delete("/api/categories/{category_id}", status_code=204)
def delete_category(category_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_category = db.query(Category).filter(Category.id == category_id, Category.user_id == current_user.id).first()
    if db_category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(db_category)
    db.commit()
    return

# --- サイト作成/スクレイピング機能 ---
@app.post("/api/sites", response_model=SiteResponse)
def create_site(site: SiteCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    category = db.query(Category).filter(Category.id == site.category_id, Category.user_id == current_user.id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found for this user")
        
    title = site.title
    # タイトルが未指定の場合、スクレイピングで自動取得を試みる
    if not title:
        try:
            # スクレイピング処理
            headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'}
            page = requests.get(site.url, timeout=5, headers=headers)
            page.raise_for_status()
            soup = BeautifulSoup(page.content, "html.parser")
            title_tag = soup.find('title')
            title = title_tag.get_text(strip=True) if title_tag else "タイトル取得失敗"
        except requests.RequestException:
            title = "タイトル取得失敗"
    
    # ファビコンはGoogleのサービスを利用して自動取得
    favicon_url = f"https://www.google.com/s2/favicons?domain={urlparse(site.url).netloc}&sz=32"
    max_order = db.query(Site).filter(Site.category_id == site.category_id).count()
    db_site = Site(title=title, url=site.url, category_id=site.category_id, favicon_url=favicon_url, display_order=max_order)
    db.add(db_site)
    db.commit()
    db.refresh(db_site)
    return db_site

# --- その他のサイト・並び替えエンドポイント (ロジック変更なし) ---
@app.put("/api/sites/{site_id}", response_model=SiteResponse)
def update_site_title(site_id: int, site_update: SiteUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_site = db.query(Site).join(Category).filter(Site.id == site_id, Category.user_id == current_user.id).first()
    if not db_site:
        raise HTTPException(status_code=404, detail="Site not found")
    db_site.title = site_update.title
    db.commit()
    db.refresh(db_site)
    return db_site

@app.delete("/api/sites/{site_id}", status_code=204)
def delete_site(site_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_site = db.query(Site).join(Category).filter(Site.id == site_id, Category.user_id == current_user.id).first()
    if db_site is None:
        raise HTTPException(status_code=404, detail="Site not found")
    db.delete(db_site)
    db.commit()
    return

@app.post("/api/update-order/categories")
def update_categories_order(order_updates: List[OrderUpdateRequest], db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    for update in order_updates:
        db.query(Category).filter(Category.id == update.id, Category.user_id == current_user.id).update({"display_order": update.order})
    db.commit()
    return {"message": "Categories order updated"}

@app.post("/api/update-order/sites")
def update_sites_order(order_updates: List[OrderUpdateRequest], db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    site_ids = [update.id for update in order_updates]
    sites_to_update = db.query(Site).join(Category).filter(Site.id.in_(site_ids), Category.user_id == current_user.id).all()
    if len(sites_to_update) != len(site_ids):
        raise HTTPException(status_code=403, detail="Permission denied to update one or more sites")
    
    for update in order_updates:
        for site in sites_to_update:
            if site.id == update.id:
                site.display_order = update.order
                break
    db.commit()
    return {"message": "Sites order updated"}

@app.post("/api/move-site")
def move_site(move_request: MoveSiteRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    site_to_move = db.query(Site).join(Category).filter(Site.id == move_request.site_id, Category.user_id == current_user.id).first()
    dest_category = db.query(Category).filter(Category.id == move_request.new_category_id, Category.user_id == current_user.id).first()

    if not site_to_move or not dest_category:
        raise HTTPException(status_code=404, detail="Site or destination category not found or permission denied")
        
    site_to_move.category_id = move_request.new_category_id
    db.commit()
    return {"message": "Site moved successfully"}
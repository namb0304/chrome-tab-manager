from fastapi import FastAPI
from dotenv import load_dotenv

load_dotenv() # .envファイルを読み込む

app = FastAPI()

# --- 1. データベース接続設定 ---
# ↓↓↓ docker-compose.yml の設定に合わせる ↓↓↓
DB_USER = "user"          # docker-compose.yml の POSTGRES_USER
DB_PASSWORD = "password"  # docker-compose.yml の POSTGRES_PASSWORD
DB_HOST = "db"            # Dockerサービス名 (localhostではなくdbコンテナを指す)
DB_NAME = "mydatabase"    # docker-compose.yml の POSTGRES_DB
DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}"

# ルーターのインポート（ファイル分割を推奨）
# app.include_router(auth_router, prefix="/api/v1/auth", tags=["Auth"])
# app.include_router(site_router, prefix="/api/v1/sites", tags=["Sites"])
# app.include_router(category_router, prefix="/api/v1/categories", tags=["Categories"])

@app.get("/")
def read_root():
    return {"Hello": "Tab Manager API"}

# ... 認証処理やDB接続の設定が続きます ...
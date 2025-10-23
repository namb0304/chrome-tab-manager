// FastAPIのスキーマに対応した型定義
export interface Site {
    id: number;
    title: string;
    url: string;
    favicon_url: string | null;
    display_order: number;
    category_id: number;
}

export interface Category {
    id: number;
    name: string;
    display_order: number;
    sites: Site[]; // CategoryResponseのsitesプロパティに対応
}

// Google JWTのデコード後のペイロード型
export interface DecodedUser {
    email: string;
    name: string;
    picture: string;
    sub: string; // Google ID
    // 実際にはもっと多いが、利用するプロパティのみ定義
    [key: string]: any; 
}

// DND-Kitのイベント型
export type DndId = string | number;
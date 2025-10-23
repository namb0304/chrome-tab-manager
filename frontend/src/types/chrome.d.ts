// Chrome拡張機能のAPIをグローバルに定義する

declare namespace chrome {
    export const runtime: {
        sendMessage: (extensionId: string, message: any, callback?: (response: any) => void) => void;
        lastError: { message: string } | undefined;
        onMessage: {
            addListener: (callback: (message: any, sender: any, sendResponse: (response: any) => void) => void) => void;
        };
        getURL: (path: string) => string; 
        getManifest: () => any;
        
        // ⭐ 修正: id プロパティを追加し、拡張機能の ID を文字列として認識させる
        id: string; 
    };
    export const tabs: {
        query: (queryInfo: any, callback: (tabs: any[]) => void) => void;
        create: (createProperties: { url: string }) => void;
    };
    export const storage: {
        local: {
            set: (items: { [key: string]: any }, callback?: () => void) => void;
            get: (keys: string | string[] | { [key: string]: any } | null, callback: (items: { [key: string]: any }) => void) => void;
            remove: (keys: string | string[], callback?: () => void) => void;
        };
    };
    export const action: {
        disable: (tabId?: number) => void;
        setPopup: (details: { popup: string }) => void;
    };
}

// window.chrome が存在することを宣言
interface Window {
    chrome: typeof chrome;
}

// グローバルな chrome API を宣言
declare const chrome: typeof chrome;
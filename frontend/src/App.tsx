import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { MouseEvent } from 'react'; 
import axios, { type InternalAxiosRequestConfig } from 'axios';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import './App.css';
import type { Category, Site, DecodedUser, DndId } from './types'; 

const API_URL = 'http://localhost:8000';
// ⭐ 拡張機能IDを定数として定義し、全箇所で利用します
const EXTENSION_ID = 'lcbflkbmmfcmhmmknnodkmknegecfcfa'; 

// --- axiosの共通設定 ---
axios.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // localStorage からトークンを取得 (Webサイト用)
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// --- アイコンコンポーネント (省略) ---
const EditIcon = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"></path></svg>;
const DeleteIcon = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path></svg>;
const GrabHandleIcon = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 9H4v2h16V9zM4 15h16v-2H4v2z"></path></svg>;

// --- ドラッグ可能なサイトアイテムコンポーネント (省略) ---
interface SiteItemProps {
    site: Site;
    onDelete: (e: MouseEvent, siteId: number) => void;
    onUpdateTitle: (siteId: number, newTitle: string) => void;
}
function SiteItem({ site, onDelete, onUpdateTitle }: SiteItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(site.title);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `site-${site.id}` });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  
  const handleTitleUpdate = () => {
    setIsEditing(false);
    if (title.trim() && title !== site.title) {
      onUpdateTitle(site.id, title);
    } else {
      setTitle(site.title);
    }
  };

  return (
    <li className={`site-item ${isDragging ? 'dragging' : ''}`} ref={setNodeRef} style={style} {...attributes}>
      <span className="grab-handle" {...listeners}><GrabHandleIcon /></span>
      {isEditing ? (
        <div className="site-link-area">
          <img src={site.favicon_url || 'https://placehold.co/32x32/e9ecef/6c757d?text=?'} alt="" className="site-favicon" />
          <div className="site-title-container">
            <input 
              type="text" 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              onBlur={handleTitleUpdate} 
              onKeyDown={e => e.key === 'Enter' && handleTitleUpdate()} 
              autoFocus 
              onClick={e => e.preventDefault()} 
            />
          </div>
        </div>
      ) : (
        <a href={site.url} target="_blank" rel="noopener noreferrer" className="site-link-area">
          <img 
            src={site.favicon_url || 'https://placehold.co/32x32/e9ecef/6c757d?text=?'} 
            alt="" 
            className="site-favicon" 
            onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => { 
                e.currentTarget.onerror = null; 
                e.currentTarget.src='https://placehold.co/32x32/e9ecef/6c757d?text=?'; 
            }}
          />
          <span>{site.title}</span>
        </a>
      )}
      <div className="site-actions">
        <button onMouseDown={(e) => e.stopPropagation()} onClick={() => setIsEditing(true)} title="サイト名を編集"><EditIcon /></button>
        <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => onDelete(e, site.id)} title="サイトを削除"><DeleteIcon /></button>
      </div>
    </li>
  );
}

// --- ドラッグ可能なカテゴリカードコンポーネント (省略) ---
interface CategoryCardProps {
    category: Category;
    children: React.ReactNode;
    onDeleteCategory: (e: MouseEvent, categoryId: number) => void;
    onUpdateCategory: (categoryId: number, newName: string) => void;
}
function CategoryCard({ category, children, onDeleteCategory, onUpdateCategory }: CategoryCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `category-${category.id}` });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };
  
  const handleNameUpdate = () => {
    setIsEditing(false);
    if (name.trim() && name !== category.name) {
      onUpdateCategory(category.id, name);
    } else {
      setName(category.name);
    }
  };

  return (
    <div className={`category-card ${isDragging ? 'dragging' : ''}`} ref={setNodeRef} style={style} {...attributes}>
      <div className="category-header">
        {isEditing ? (
          <input 
            type="text" 
            value={name} 
            onChange={e => setName(e.target.value)} 
            onBlur={handleNameUpdate} 
            onKeyDown={e => e.key === 'Enter' && handleNameUpdate()} 
            autoFocus 
          />
        ) : (
          <h2 onDoubleClick={() => setIsEditing(true)} title="ダブルクリックで編集">{category.name}</h2>
        )}
        <div className="category-actions">
          <button className="grab-handle" {...listeners}><GrabHandleIcon /></button>
          <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => onDeleteCategory(e, category.id)} title="カテゴリを削除"><DeleteIcon /></button>
        </div>
      </div>
      {children}
    </div>
  );
}

// --- メインAppコンポーネント ---
function App() {
  const [token, setToken] = useState<string | null>(null); 
  const [user, setUser] = useState<DecodedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true); 
  
  // ⭐ 修正: 拡張機能のストレージからトークンを読み込む処理
  useEffect(() => {
    const checkStorage = async () => {
        let storedToken: string | null = null;
        
        // 1. Chrome拡張機能環境の場合、chrome.storageからトークンを取得 (awaitで確実化)
        if (typeof (window as any).chrome !== 'undefined' && window.chrome.storage && window.chrome.storage.local) {
            const result = await new Promise(resolve => {
                window.chrome.storage.local.get(['accessToken'], resolve);
            });
            storedToken = (result as { accessToken: string | null }).accessToken;
        } else {
            // 2. Webサイト環境の場合、localStorageから取得
            storedToken = localStorage.getItem('accessToken');
        }

        if (storedToken) {
            setToken(storedToken);
        }
        setIsLoading(false);
    };
    checkStorage();
  }, []); 

  
  // ログイン成功時の処理
  const handleLoginSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
        console.error('Credential is null');
        return;
    }
    
    try {
      const response = await axios.post(`${API_URL}/api/auth/google`, {
        token: credentialResponse.credential,
      });

      const accessToken: string = response.data.access_token;
      
      localStorage.setItem('accessToken', accessToken); // Webサイト用に保存
      setToken(accessToken);

      console.log('✅ ログイン成功！');

      // ⭐⭐⭐ 最終修正ポイント: chrome.storage.local に確実に書き込み、ポップアップを更新させる ⭐⭐⭐
      try {
        const chromeAPI: typeof chrome | undefined = (window as any).chrome;
        if (chromeAPI && chromeAPI.storage) {
          
          // ポップアップが読み込めるように、ローカルストレージに直接保存 (awaitで確実化)
          await new Promise<void>(resolve => {
            chromeAPI.storage.local.set({ 'accessToken': accessToken }, resolve);
          });
          console.log('✅ Token saved to chrome.storage.local for pop-up use.');
          
          // Service Workerへのメッセージ送信 (安全策)
          if (chromeAPI.runtime && chromeAPI.runtime.sendMessage) {
              chromeAPI.runtime.sendMessage(
                EXTENSION_ID,
                { action: 'saveToken', token: accessToken },
                // ⭐ ビルドエラー解消: 引数名を _response に変更
                (_response: any) => {
                  if (chromeAPI.runtime.lastError) {
                    console.log('📌 Service Workerにメッセージが届きません');
                  } else {
                    console.log('✅ Service Workerにトークンを同期しました');
                  }
                }
              );
          }
        }
      } catch (error) {
        console.log('📌 Chrome拡張との通信エラー（無視可能）:', error);
      }
      // ⭐⭐⭐ 修正終了 ⭐⭐⭐

    } catch (error) {
      console.error('❌ ログイン失敗:', error);
      alert('ログインに失敗しました。もう一度お試しください。');
    }
  };

  // ログアウト処理
  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    setToken(null);
    setUser(null);
    
    // Chrome拡張のトークンも削除を試みる
    try {
      const chromeAPI: typeof chrome | undefined = (window as any).chrome;
      if (chromeAPI && chromeAPI.storage) {
        
        // Service Workerのストレージからトークンを削除
        chromeAPI.storage.local.remove('accessToken', () => {
            console.log('✅ Token removed from chrome.storage.local.');
        });

        // Service Workerへのメッセージ送信 (安全策)
        if (chromeAPI.runtime && chromeAPI.runtime.sendMessage) {
            chromeAPI.runtime.sendMessage(
              EXTENSION_ID,
              { action: 'removeToken' },
              () => console.log('拡張機能のトークンを削除しました (via Message)')
            );
        }
      }
    } catch (error) {
      console.log('Chrome拡張との通信エラー（無視可能）:', error);
    }
  };

  
  
  // トークンが変更された時にユーザー情報を取得
  useEffect(() => {
    // isLoading中はスキップする
    if (token && !isLoading) {
      try {
        const decodedUser = jwtDecode<DecodedUser>(token); 
        setUser(decodedUser);
      } catch (error) {
        console.error("無効なトークン:", error);
        handleLogout();
      }
    }
  }, [token, isLoading]);

  // ログインが必要なコンポーネント (ポップアップでは表示しない)
  const LoginComponent = (
      <div className="login-container">
        <h1>Dashboard Login</h1>
        <p>Please log in with your Google account to continue.</p>
        <GoogleLogin
          onSuccess={handleLoginSuccess}
          onError={() => {
            console.log('Login Failed');
            alert('ログインに失敗しました');
          }}
        />
      </div>
  );
  
  if (isLoading) {
    return <div className="login-container">Loading...</div>; // ロード中は待機
  }
  
  // ⭐⭐ 修正: 拡張機能コンテキストの判定をより安全に修正 ⭐⭐
  const isExtensionContext = typeof (window as any).chrome !== 'undefined' && 
                            window.chrome.runtime && 
                            typeof window.chrome.runtime.id === 'string';
                             
  if (!token && !isExtensionContext) {
    // Webサイト（新しいタブ）でトークンがなければ、ログインコンポーネントを表示
    return LoginComponent;
  }
  
  if (!token && isExtensionContext) {
      // ポップアップの場合、ログインボタンのロード失敗を避けるため、シンプルなメッセージを出す
      return (
          <div className="login-container">
            <h1>ログインが必要です</h1>
            <p>設定ページ（新しいタブ）でログインしてください。</p>
            {/* ⭐ window.chrome.runtime.getURL の型エラーは chrome.d.ts の修正で解消済みのはずです */}
            <button onClick={() => window.open(window.chrome.runtime.getURL('index.html'))} className="primary-btn">設定ページを開く</button>
          </div>
      );
  }


  // ログインしている場合の表示
  return <Dashboard onLogout={handleLogout} user={user} />;
}

// --- ダッシュボードコンポーネント (省略) ---
interface DashboardProps {
    onLogout: () => void;
    user: DecodedUser | null;
}
function Dashboard({ onLogout, user }: DashboardProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSite, setNewSite] = useState({ title: '', url: '', category_id: '' });
  const [searchTerm, setSearchTerm] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor), 
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  
  const fetchData = useCallback(() => {
    axios.get<Category[]>(`${API_URL}/api/categories`)
      .then(res => setCategories(res.data))
      .catch(err => {
        console.error("データ取得エラー:", err);
        // APIアクセスに失敗した場合、認証が切れたとみなし、強制ログアウトを促す
        if (err.response && err.response.status === 401) {
          alert('セッションが切れました。設定ページでログインし直してください。');
          onLogout();
        }
      });
  }, [onLogout]);

  useEffect(() => {
    fetchData();
    
    try {
        const chromeAPI: typeof chrome | undefined = (window as any).chrome;
        if (chromeAPI && chromeAPI.runtime && chromeAPI.runtime.sendMessage) {
            
            const extensionId = EXTENSION_ID; // 定数から取得

            chromeAPI.runtime.sendMessage(
                extensionId, // IDを第一引数に渡す
                { action: 'getCurrentTabInfo' }, // メッセージオブジェクト
                (response: { url?: string, title?: string, error?: string }) => {
                    if (chromeAPI.runtime.lastError) {
                        console.log('📌 Service Workerとの通信エラー (getCurrentTabInfo)', chromeAPI.runtime.lastError.message);
                        return;
                    }
                    if (response.url) {
                        setNewSite(prev => ({ 
                            ...prev, 
                            url: response.url || '',
                            title: response.title || '', // titleも自動設定
                        }));
                        console.log('✅ 現在のタブ情報をフォームに設定:', response);
                    } else if (response.error) {
                        console.error('❌ タブ情報取得エラー:', response.error);
                    }
                }
            );
        }
    } catch (error) {
        console.log('📌 Chrome APIエラー (getCurrentTabInfo):', error);
    }
    
  }, [fetchData]);

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    axios.post(`${API_URL}/api/categories`, { name: newCategoryName })
      .then(() => {
        setNewCategoryName('');
        fetchData();
      })
      .catch(err => console.error('カテゴリ作成エラー:', err));
  };

  const handleCreateSite = (e: React.FormEvent) => {
    e.preventDefault();
    axios.post(`${API_URL}/api/sites`, { 
      ...newSite, 
      category_id: parseInt(newSite.category_id) 
    })
      .then(() => {
        setNewSite({ title: '', url: '', category_id: '' });
        fetchData();
      })
      .catch(err => console.error('サイト追加エラー:', err));
  };

  const handleDeleteSite = (e: MouseEvent, siteId: number) => {
    e.stopPropagation();
    if (window.confirm('このサイトを削除しますか？')) {
      axios.delete(`${API_URL}/api/sites/${siteId}`)
        .then(fetchData)
        .catch(err => console.error('サイト削除エラー:', err));
    }
  };
  
  const handleUpdateSiteTitle = (siteId: number, newTitle: string) => {
    axios.put(`${API_URL}/api/sites/${siteId}`, { title: newTitle })
      .then(fetchData)
      .catch(err => console.error('サイト名更新エラー:', err));
  };

  const handleDeleteCategory = (e: MouseEvent, categoryId: number) => {
    e.stopPropagation();
    if (window.confirm('このカテゴリと含まれる全てのサイトを削除します。よろしいですか？')) {
      axios.delete(`${API_URL}/api/categories/${categoryId}`)
        .then(fetchData)
        .catch(err => console.error('カテゴリ削除エラー:', err));
    }
  };
  
  const handleUpdateCategory = (categoryId: number, newName: string) => {
    axios.put(`${API_URL}/api/categories/${categoryId}`, { name: newName })
      .then(fetchData)
      .catch(err => console.error('カテゴリ名更新エラー:', err));
  };
  
  function getContainerId(id: DndId): DndId | null {
    if (typeof id === 'string' && id.startsWith('category-')) {
      return id;
    }
    for (const category of categories) {
      if (category.sites.some(s => `site-${s.id}` === id)) {
        return `category-${category.id}`;
      }
    }
    return null;
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    // カテゴリの並び替え
    if (activeId.toString().startsWith('category-') && overId.toString().startsWith('category-')) {
      setCategories((items: Category[]) => {
        const oldIndex = items.findIndex(item => `category-${item.id}` === activeId);
        const newIndex = items.findIndex(item => `category-${item.id}` === overId);
        if (oldIndex === -1 || newIndex === -1) return items;

        const newArray = arrayMove(items, oldIndex, newIndex);
        const orderUpdates = newArray.map((cat, index) => ({ id: cat.id, order: index }));
        axios.post(`${API_URL}/api/update-order/categories`, orderUpdates);
        return newArray;
      });
      return;
    }

    // サイトの並び替え (カテゴリ間移動含む)
    if (activeId.toString().startsWith('site-')) {
      const activeContainerId = getContainerId(activeId);
      let overContainerId = getContainerId(overId);
      if (overId.toString().startsWith('category-')) {
        overContainerId = overId;
      }

      if (!activeContainerId || !overContainerId) return;

      setCategories(prev => {
        const sourceCatIndex = prev.findIndex(c => `category-${c.id}` === activeContainerId);
        const destCatIndex = prev.findIndex(c => `category-${c.id}` === overContainerId);
        const activeIndex = prev[sourceCatIndex].sites.findIndex(s => `site-${s.id}` === activeId);
        
        let overIndex;
        if (overId.toString().startsWith('site-')) {
          overIndex = prev[destCatIndex].sites.findIndex(s => `site-${s.id}` === overId);
        } else {
          overIndex = prev[destCatIndex].sites.length;
        }

        let newCategories: Category[] = JSON.parse(JSON.stringify(prev));
        
        // サイトの並び順調整とAPIコール
        if (activeContainerId === overContainerId) {
          newCategories[sourceCatIndex].sites = arrayMove(newCategories[sourceCatIndex].sites, activeIndex, overIndex);
          const orderUpdates = newCategories[sourceCatIndex].sites.map((site, index) => ({ id: site.id, order: index }));
          axios.post(`${API_URL}/api/update-order/sites`, orderUpdates);
        } else {
          // サイトのカテゴリ間移動
          const [movedItem] = newCategories[sourceCatIndex].sites.splice(activeIndex, 1);
          newCategories[destCatIndex].sites.splice(overIndex, 0, movedItem);

          // 移動元の並び順更新
          const sourceOrderUpdates = newCategories[sourceCatIndex].sites.map((site, index) => ({ id: site.id, order: index }));
          axios.post(`${API_URL}/api/update-order/sites`, sourceOrderUpdates);
          
          // 移動先の並び順更新
          const destOrderUpdates = newCategories[destCatIndex].sites.map((site, index) => ({ id: site.id, order: index }));
          axios.post(`${API_URL}/api/update-order/sites`, destOrderUpdates);
          
          // DBにカテゴリ変更を通知
          const siteId = parseInt(activeId.toString().replace('site-', ''));
          const newCategoryId = parseInt(overContainerId.toString().replace('category-', ''));
          axios.post(`${API_URL}/api/move-site`, { site_id: siteId, new_category_id: newCategoryId });
        }
        return newCategories;
      });
    }
  }
  
  const filteredCategories = useMemo(() => categories.map(category => ({
    ...category,
    sites: category.sites.filter(site => 
      (site.title && site.title.toLowerCase().includes(searchTerm.toLowerCase())) || 
      (site.url && site.url.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  })).filter(category => 
    category.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    category.sites.length > 0
  ), [categories, searchTerm]);

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="user-profile">
          <p>Welcome, {user?.name || user?.email || 'User'}</p> 
          <button onClick={onLogout} className="logout-btn">Logout</button>
        </div>
        <h2>サイト管理アプリ</h2>
        <div className="form-section">
          <h3>新しいカテゴリを追加</h3>
          <form onSubmit={handleCreateCategory}>
            <input 
              type="text" 
              value={newCategoryName} 
              onChange={e => setNewCategoryName(e.target.value)} 
              placeholder="カテゴリ名（例: 仕事用、課題）" 
              required 
            />
            <button type="submit" className="primary-btn">カテゴリ作成</button>
          </form>
        </div>
        <div className="form-section">
          <h3>新しいサイトを追加</h3>
          <form onSubmit={handleCreateSite}>
            <input 
              type="text" 
              value={newSite.title} 
              onChange={e => setNewSite({...newSite, title: e.target.value})} 
              placeholder="サイト名 (空欄で自動取得)" 
            />
            <input 
              type="url" 
              value={newSite.url} 
              onChange={e => setNewSite({...newSite, url: e.target.value})} 
              placeholder="URL" 
              required 
            />
            <select 
              value={newSite.category_id} 
              onChange={e => setNewSite({...newSite, category_id: e.target.value})} 
              required
            >
              <option value="" disabled>カテゴリを選択</option>
              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
            <button type="submit" className="primary-btn">サイト追加</button>
          </form>
        </div>
      </aside>
      <main className="main-content">
        <div className="main-header">
          <h1>ダッシュボード</h1>
          <input 
            type="text" 
            className="search-bar" 
            placeholder="カテゴリやサイトを検索..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
          />
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="dashboard">
            <SortableContext items={filteredCategories.map(c => `category-${c.id}` as DndId)} strategy={rectSortingStrategy}>
              {filteredCategories.map(category => (
                <CategoryCard 
                  key={category.id} 
                  category={category} 
                  onDeleteCategory={handleDeleteCategory} 
                  onUpdateCategory={handleUpdateCategory}
                >
                  <SortableContext items={category.sites.map(s => `site-${s.id}` as DndId)} strategy={verticalListSortingStrategy}>
                    <ul className="site-list">
                      {category.sites.map(site => (
                        <SiteItem 
                          key={site.id} 
                          site={site} 
                          onDelete={handleDeleteSite} 
                          onUpdateTitle={handleUpdateSiteTitle} 
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </CategoryCard>
              ))}
            </SortableContext>
          </div>
        </DndContext>
      </main>
    </div>
  );
}

export default App;
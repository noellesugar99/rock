'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, SlidersHorizontal, X } from 'lucide-react';
import { NOAH_COLLECTION_LABELS, NOAH_COLLECTION_SOURCES } from '@/lib/noah-collection';
import NoahPinGrid, {type NoahPinView} from './noah-pin-grid';
import NoahLoading from './noah-loading';
import { Drawer, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger } from './ui/drawer';
import styles from './noah-pins.module.css';
type Page={items:NoahPinView[];nextCursor:string|null;ownerScope:string|null;total:number};
const ORDERS = [['hot', 'おすすめ順'], ['new', '出た順']] as const;
const SCOPES = [['noah', '接続できる'], ['', 'すべて'], ['discovered', '外部で発見']] as const;
export default function NoahPinHome({fallback,searchQuery='',initialSource='noah',onClearQuery}:{fallback?:ReactNode;searchQuery?:string;initialSource?:string;onClearQuery?:()=>void}) {
  const params=useSearchParams();
  const [source,setSource]=useState(params.get('collectionSource')??initialSource),[attempt,setAttempt]=useState(0);
  const [order,setOrder]=useState<'hot'|'new'>('hot');
  const [state,setState]=useState<{key:string;page?:Page;error?:string;more?:boolean}>();
  const key=new URLSearchParams({q:searchQuery,source,order,cursor:'0'}).toString(),current=state?.key===key?state:undefined;
  const provider = NOAH_COLLECTION_SOURCES.find(value => value === source);
  const sourceName = provider && NOAH_COLLECTION_LABELS[provider];
  const scope = sourceName ? 'discovered' : source;
  const generation=useRef(0);
  function chooseSource(value:string){
    setSource(value);
    const url=new URL(window.location.href);url.searchParams.set('collectionSource',value);
    window.history.replaceState(window.history.state,'',url);
  }
  useEffect(()=>{
    const restore=()=>setSource(new URLSearchParams(window.location.search).get('collectionSource')??initialSource);
    window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);
  },[initialSource]);
  useEffect(()=>{
    const version=++generation.current,controller=new AbortController();
    void fetch(`/api/noah/discover?${key}`,{cache:'no-store',signal:controller.signal}).then(async r=>{
      const page=await r.json() as Page & {error?:string};
      if(!r.ok || !Array.isArray(page.items))throw Error(page.error??'一覧を読み込めませんでした。');
      if(version===generation.current)setState({key,page});
    }).catch(e=>{if(!controller.signal.aborted && version===generation.current)setState({key,error:e.message});});
    return ()=>controller.abort();
  },[key,attempt]);
  useEffect(()=>{
    const update=()=>{if(!document.hidden && (current?.page?.items.length??0)<=20)setAttempt(n=>n+1);};
    const timer=setInterval(update,60_000);window.addEventListener('focus',update);
    return ()=>{clearInterval(timer);window.removeEventListener('focus',update);};
  },[current?.page?.items.length]);
  async function more(){
    if(!current?.page?.nextCursor || current.more)return;
    const cursor=current.page.nextCursor,version=generation.current;
    setState({...current,more:true,error:undefined});
    try{
      const params=new URLSearchParams(key);params.set('cursor',cursor);
      const r=await fetch(`/api/noah/discover?${params}`,{cache:'no-store'}),page=await r.json() as Page & {error?:string};
      if(!r.ok || !Array.isArray(page.items))throw Error(page.error??'続きを読み込めませんでした。');
      if(version!==generation.current)return;
      if(page.ownerScope!==current.page.ownerScope){setAttempt(n=>n+1);return;}
      const known=new Set(current.page.items.map(i=>i.feedbackId??i.id));
      setState({key,page:{...page,items:[...current.page.items,...page.items.filter(i=>!known.has(i.feedbackId??i.id))]}});
    }catch(e){if(version===generation.current)setState({...current,error:e instanceof Error?e.message:'続きを読み込めませんでした。'});}
  }
  async function hide(id:string){
    if(!current?.page)return;
    const version=generation.current;
    const r=await fetch('/api/noah/boards',{method:'POST',headers:{'Content-Type':'application/json','X-Rock-Owner-Scope':current.page.ownerScope??''},body:JSON.stringify({action:'hide',familyId:id})});
    if(version!==generation.current)return;
    if(r.ok)setState({...current,page:{...current.page,items:current.page.items.filter(i=>i.id!==id)}});
    else setState({...current,error:'非表示にできませんでした。再試行してください。'});
  }
  return <section id="noah-collection" className={styles.home} aria-label="Agent一覧">
    <div className={styles.feedHeading}>
      <h2>Agentを見つける</h2>
      {current?.page && <span className={styles.resultCount}>{current.page.total.toLocaleString('ja-JP')}件</span>}
      {source !== 'noah' && <Drawer showSwipeHandle>
        <DrawerTrigger className={styles.filterTrigger} aria-label={sourceName ? `絞り込みと並び順 · ${sourceName}` : '絞り込みと並び順'} data-filtered={Boolean(sourceName || order !== 'hot') || undefined}>
          <SlidersHorizontal size={17} aria-hidden="true" />{sourceName ?? '絞り込み'}
        </DrawerTrigger>
        <DrawerContent className={styles.filterDrawer}>
          <div className={styles.filterDrawerHeader}>
            <DrawerTitle className={styles.filterDrawerTitle}>絞り込み</DrawerTitle>
            <DrawerClose className={styles.filterClose} aria-label="閉じる"><X size={20} aria-hidden="true" /></DrawerClose>
          </div>
          <div className={styles.filterDrawerOptions}>
            <fieldset>
              <legend>提供元</legend>
              <div className={styles.filterChoices}>
                <button type="button" aria-pressed={!sourceName} onClick={() => chooseSource(scope === '' ? '' : 'discovered')}>指定なし</button>
                {NOAH_COLLECTION_SOURCES.map(value => <button key={value} type="button" aria-pressed={source === value} onClick={() => chooseSource(value)}>{NOAH_COLLECTION_LABELS[value]}</button>)}
              </div>
            </fieldset>
            <fieldset>
              <legend>並び順</legend>
              <div className={styles.filterChoices}>{ORDERS.map(([value, label]) => <button key={value} type="button" aria-pressed={order === value} onClick={() => setOrder(value)}>{label}</button>)}</div>
            </fieldset>
          </div>
          <DrawerClose className={styles.filterDone}><Check size={18} aria-hidden="true" />結果を見る</DrawerClose>
        </DrawerContent>
      </Drawer>}
    </div>
    <fieldset className={styles.scopeFilters} aria-label="Agentの種類">{SCOPES.map(([value, label]) => <button key={value} type="button" aria-pressed={value === scope} onClick={() => chooseSource(value)}>{label}</button>)}</fieldset>
    {source !== 'noah' && <div className={styles.desktopFilters}>
      <details className={styles.sourceFilter}><summary>提供元で絞り込む{sourceName && ` · ${sourceName}`}</summary><div className={styles.filters}>{NOAH_COLLECTION_SOURCES.map(value => <button key={value} type="button" aria-pressed={source === value} onClick={() => chooseSource(value)}>{NOAH_COLLECTION_LABELS[value]}</button>)}</div></details>
      <fieldset className={styles.filters} aria-label="並び順">{ORDERS.map(([value, label]) => <button key={value} type="button" aria-pressed={order === value} onClick={() => setOrder(value)}>{label}</button>)}</fieldset>
    </div>}
    {(searchQuery && onClearQuery) && <button type="button" className={styles.recovery} onClick={()=>{onClearQuery?.();}}>検索条件をクリア</button>}
    {!current && <NoahLoading label="読み込んでいます…" variant="cards"/>}
    {current?.error && <div role="alert" className={styles.status}>{current.error}<button type="button" className={styles.recovery} onClick={()=>current.page?void more():setAttempt(n=>n+1)}>再試行</button></div>}
    {current?.page?.items.length===0 && <p className={styles.status}>この条件のAgentはまだありません。</p>}
    {current?.page && <NoahPinGrid items={current.page.items} signedIn={current.page.ownerScope!==null} ownerScope={current.page.ownerScope} onChange={(id,savedIn)=>setState(old=>old?.key===key && old.page?{...old,page:{...old.page,items:old.page.items.map(i=>i.id===id?{...i,savedIn}:i)}}:old)} onHide={id=>void hide(id)}/>}
    {current?.page?.nextCursor && <div className={styles.moreRow}><button type="button" disabled={current.more} onClick={()=>void more()}>{current.more?'読み込み中…':'もっと見る'}</button></div>}
    {current?.error && !current.page && fallback}
  </section>;
}

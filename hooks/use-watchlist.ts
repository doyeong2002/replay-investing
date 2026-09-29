'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WATCHLIST_STOCKS } from '@/constants/watchlist';
import type { StockQuote, WatchlistCategory, WatchlistItem, WatchlistStock } from '@/types/watchlist';

interface TossPricesResponse {
  connected: boolean;
  message?: string;
  prices?: Array<{ symbol:string; timestamp?:string; lastPrice:string|number; currency?:string }>;
}

interface TossCandlesResponse {
  connected:boolean;
  message?:string;
  candles?:Array<{timestamp:string;closePrice:string|number}>;
}

const emptyGroups = ():Record<WatchlistCategory,WatchlistItem[]> => ({
  HOLDINGS:[],
  LEVERAGED:[],
  M7:[],
  AI_CHIPS:[],
  SOFTWARE:[],
  SPACE:[],
  ENERGY:[],
  QUANTUM:[],
  BIO:[],
  FINTECH:[],
  CUSTOM:[],
});

const classifyTicker=(ticker:string):WatchlistCategory=>{
  const existing=WATCHLIST_STOCKS.find(stock=>stock.ticker===ticker)?.category;
  if(existing)return existing;
  const groups:Partial<Record<WatchlistCategory,string[]>>={
    M7:['NFLX','TSLL','TSLT','NVDL','NVDX','AAPU','AAPB','AMZU','AMZZ','MSFU','GGLL','FBL'],
    AI_CHIPS:['SOXL','SOXS','USD','SSG','QCOM','ARM','MRVL','INTC','AMAT','LRCX'],SOFTWARE:['ORCL','PLTR','CRM','NOW','SNOW','DDOG','MDB'],SPACE:['BA','NOC','LMT','RKLX','RKLB','LUNR'],
    ENERGY:['OKLL','OKLS','NEE','ETN','GEV','BWXT'],QUANTUM:['IBM','GOOG','IONX','QBTX'],BIO:['ABBV','MRK','PFE','TMO','LLYX','NVOX'],
    FINTECH:['BITO','BITX','BITU','BITI','CONL','MSTU','MSTX','MSTZ','BMNR','SOFI','NU','AFRM','UPST'],LEVERAGED:['SPXL','UPRO','SQQQ','TQQQ','BULZ'],
  };
  return (Object.entries(groups).find(([,symbols])=>symbols.includes(ticker))?.[0] as WatchlistCategory|undefined)??'CUSTOM';
};

const addedStockNames:Record<string,string>={
  OKLL:'OKLO 2배 레버리지 ETF',BMNR:'비트마인 이머전 테크놀로지스',ORCL:'오라클',PLTR:'팔란티어',NFLX:'넷플릭스',QCOM:'퀄컴',ARM:'Arm',MRVL:'마벨 테크놀로지',
};

export function useWatchlist(heldStocks:readonly WatchlistStock[]) {
  const [quotesByTicker,setQuotesByTicker] = useState<Record<string,StockQuote>>({});
  const [historyByTicker,setHistoryByTicker] = useState<Record<string,number[]>>({});
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const previousCloseRef=useRef<Record<string,number>>({});
  const [customStocks,setCustomStocks]=useState<WatchlistStock[]>(()=>{try{if(typeof window!=='undefined'){const saved=localStorage.getItem('replay:custom-watchlist');if(saved)return (JSON.parse(saved) as WatchlistStock[]).map(stock=>({...stock,nameKo:addedStockNames[stock.ticker]??stock.nameKo,category:classifyTicker(stock.ticker)}))}}catch{}return[]});
  const [hiddenTickers,setHiddenTickers]=useState<string[]>(()=>{try{if(typeof window!=='undefined'){const saved=localStorage.getItem('replay:hidden-watchlist');return saved?(JSON.parse(saved) as string[]):[]}}catch{}return[]});
  useEffect(()=>{try{localStorage.setItem('replay:custom-watchlist',JSON.stringify(customStocks));}catch{}},[customStocks]);
  useEffect(()=>{try{localStorage.setItem('replay:hidden-watchlist',JSON.stringify(hiddenTickers));}catch{}},[hiddenTickers]);

  const allStocks=useMemo<WatchlistStock[]>(()=>{
    const heldTickers=new Set(heldStocks.map(stock=>stock.ticker));const hidden=new Set(hiddenTickers);
    const used=new Set(heldTickers);const result:WatchlistStock[]=[...heldStocks];
    for(const stock of [...customStocks,...WATCHLIST_STOCKS])if(!used.has(stock.ticker)&&!hidden.has(stock.ticker)){used.add(stock.ticker);result.push(stock);}
    return result;
  },[heldStocks,customStocks,hiddenTickers]);

  const addTicker=useCallback(async(rawTicker:string)=>{
    const ticker=rawTicker.trim().toUpperCase();
    if(!/^[A-Z][A-Z0-9.-]{0,11}$/.test(ticker))throw new Error('영문 티커를 정확히 입력해 주세요.');
    const existing=allStocks.find(stock=>stock.ticker===ticker);
    // 이미 들어간 종목을 다시 입력해도 실패시키지 않고 해당 카테고리로 이동시킨다.
    if(existing)return {...existing,alreadyExists:true};
    const builtIn=WATCHLIST_STOCKS.find(stock=>stock.ticker===ticker);
    if(builtIn){setHiddenTickers(previous=>previous.filter(item=>item!==ticker));return {...builtIn,alreadyExists:false};}
    const isLocal=['localhost','127.0.0.1'].includes(window.location.hostname);
    const base=isLocal?'http://127.0.0.1:8000/api/toss/prices':'/api/toss/prices';
    const response=await fetch(`${base}?symbols=${encodeURIComponent(ticker)}`,{cache:'no-store'});
    const data=await response.json() as TossPricesResponse;
    const price=data.prices?.find(item=>item.symbol.toUpperCase()===ticker);
    if(!response.ok||!data.connected||!price)throw new Error(data.message||'토스에서 해당 종목을 찾지 못했습니다.');
    const stock:WatchlistStock={ticker,nameKo:addedStockNames[ticker]??ticker,category:classifyTicker(ticker)};
    const lastPrice=Number(price.lastPrice);
    setQuotesByTicker(previous=>({...previous,[ticker]:{ticker,lastPrice,previousClose:null,dayChange:null,dayChangeAmount:null,currency:'USD',updatedAt:price.timestamp}}));
    setCustomStocks(previous=>{
      const next=[...previous,stock];
      // iOS PWA가 화면을 곧바로 닫더라도 추가 결과가 남도록 즉시 저장한다.
      try{localStorage.setItem('replay:custom-watchlist',JSON.stringify(next));}catch{}
      return next;
    });
    return {...stock,alreadyExists:false};
  },[allStocks]);

  const removeTicker=useCallback((rawTicker:string)=>{
    const ticker=rawTicker.trim().toUpperCase();
    if(heldStocks.some(stock=>stock.ticker===ticker))return false;
    setCustomStocks(previous=>previous.filter(stock=>stock.ticker!==ticker));
    if(WATCHLIST_STOCKS.some(stock=>stock.ticker===ticker))setHiddenTickers(previous=>previous.includes(ticker)?previous:[...previous,ticker]);
    setQuotesByTicker(previous=>{const next={...previous};delete next[ticker];return next;});
    setHistoryByTicker(previous=>{const next={...previous};delete next[ticker];return next;});
    return true;
  },[heldStocks]);

  const refresh = useCallback(async({silent=false}:{silent?:boolean}={})=>{
    if(!silent) setLoading(true);
    try{
      const isLocal=['localhost','127.0.0.1'].includes(window.location.hostname);
      const base=isLocal?'http://127.0.0.1:8000/api/toss/prices':'/api/toss/prices';
      const symbols=allStocks.map(stock=>stock.ticker);
      const batches=Array.from({length:Math.ceil(symbols.length/25)},(_,index)=>symbols.slice(index*25,index*25+25));
      const responses=await Promise.all(batches.map(async batch=>{
        const response=await fetch(`${base}?symbols=${encodeURIComponent(batch.join(','))}&refresh=${Date.now()}`,{cache:'no-store'});
        const data=await response.json() as TossPricesResponse;
        if(!response.ok||!data.connected) throw new Error(data.message||'관심종목 시세를 불러오지 못했습니다.');
        return data.prices??[];
      }));
      const rawPrices=responses.flat();
      const missingSymbols=symbols.filter(symbol=>!(previousCloseRef.current[symbol]>0));
      const candleBase=isLocal?'http://127.0.0.1:8000/api/toss/candles':'/api/toss/candles';
      for(let index=0;index<missingSymbols.length;index+=6){
        const group=missingSymbols.slice(index,index+6);
        const closes=await Promise.all(group.map(async symbol=>{
          try{
            const response=await fetch(`${candleBase}?symbol=${encodeURIComponent(symbol)}&interval=1d&count=3`,{cache:'no-store'});
            const data=await response.json() as TossCandlesResponse;
            if(!response.ok||!data.connected)return [symbol,0] as const;
            const candles=data.candles??[];
            const quote=rawPrices.find(price=>price.symbol.trim().toUpperCase()===symbol);
            const quoteDate=String(quote?.timestamp??'').slice(0,10);
            const latestDate=String(candles[0]?.timestamp??'').slice(0,10);
            const previous=quoteDate&&quoteDate===latestDate?candles[1]:candles[0];
            return [symbol,Number(previous?.closePrice??0)] as const;
          }catch{return [symbol,0] as const;}
        }));
        for(const [symbol,close] of closes)if(close>0)previousCloseRef.current[symbol]=close;
      }
      const next=rawPrices.reduce<Record<string,StockQuote>>((quotes,price)=>{
        const ticker=price.symbol.trim().toUpperCase();
        const lastPrice=Number(price.lastPrice);const previousClose=previousCloseRef.current[ticker]??null;
        const dayChange=previousClose?((lastPrice-previousClose)/previousClose*100):null;
        quotes[ticker]={ticker,lastPrice,previousClose,dayChange,dayChangeAmount:previousClose?lastPrice-previousClose:null,currency:'USD',updatedAt:price.timestamp};
        return quotes;
      },{});
      setQuotesByTicker(next);
      setHistoryByTicker(previous=>Object.fromEntries(Object.entries(next).map(([ticker,quote])=>{
        const history=previous[ticker]??(quote.previousClose?[quote.previousClose]:[]);
        const nextHistory=history.at(-1)===quote.lastPrice?history:[...history,quote.lastPrice];
        return [ticker,nextHistory.slice(-24)];
      })));
      setError(null);
    }catch(error){
      setError(error instanceof Error?error.message:'관심종목 시세를 불러오지 못했습니다.');
    }finally{
      setLoading(false);
    }
  },[allStocks]);

  useEffect(()=>{
    const initial=setTimeout(()=>void refresh({silent:true}),0);
    const interval=setInterval(()=>{if(document.visibilityState==='visible')void refresh({silent:true});},10_000);
    return()=>{clearTimeout(initial);clearInterval(interval);};
  },[refresh]);

  const items=useMemo<WatchlistItem[]>(()=>allStocks.map(stock=>({...stock,quote:quotesByTicker[stock.ticker]??null,priceHistory:historyByTicker[stock.ticker]??[]})),[allStocks,quotesByTicker,historyByTicker]);
  const grouped=useMemo(()=>items.reduce((groups,item)=>{groups[item.category].push(item);return groups;},emptyGroups()),[items]);

  return {items,grouped,loading,error,refresh,addTicker,removeTicker};
}

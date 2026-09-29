import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:'Replay — 투자 복기와 리스크 관리',
    short_name:'Replay',
    description:'보유 종목, 시장 지표와 계좌 리스크를 조회·분석합니다.',
    start_url:'/',
    display:'standalone',
    background_color:'#090d14',
    theme_color:'#090d14',
    orientation:'portrait-primary',
    icons:[{src:'/favicon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}],
  };
}

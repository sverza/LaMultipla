import type {Metadata,Viewport} from 'next';import './globals.css';
export const metadata:Metadata={title:'La Multipla · Serie A',description:'Tracker personale per la multipla Serie A da 3 €',manifest:'./manifest.webmanifest',icons:{icon:'./favicon.svg'},appleWebApp:{capable:true,title:'La Multipla',statusBarStyle:'black-translucent'}};
export const viewport:Viewport={themeColor:'#10241e',width:'device-width',initialScale:1,viewportFit:'cover'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="it"><body>{children}</body></html>}

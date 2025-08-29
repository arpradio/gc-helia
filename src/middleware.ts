import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const config = {
  matcher: [
    //'/api/routename/:path*',
    '/api/wallet/:path*',
    '/user', // Replace with actual route you wish to protect
    '/user/:path*', // Replace with actual (sub)route you wish to protect
    '/ipfs', // Replace with actual route you wish to protect
    '/ipfs/:path*', // Replace with actual (sub)route you wish to protect
    '/wallet'
  ],
};

export function middleware(request: NextRequest) {
  const currentPath = request.nextUrl.pathname;

  if (
    currentPath === '/api/wallet/connect' ||
    currentPath === '/api/wallet/session'
  ) {
    return NextResponse.next();
  }

  const walletSession = request.cookies.get('wallet_session')?.value;

  if (
    (currentPath.startsWith('/user') 
    || currentPath.startsWith('/ipfs')) &&
    !walletSession
  ) {
    const redirectPath = request.nextUrl.pathname + request.nextUrl.search;
    const noAuthUrl = new URL('/login', request.nextUrl.origin);
    noAuthUrl.searchParams.set('redirect', redirectPath);
    
    return NextResponse.redirect(noAuthUrl);
  }

  if (
    (currentPath.startsWith('/api/wallet/')
    
  // Other Routes can be added later, or existing ones modified i.e.
   //  || currentPath.startsWith('/api/routename/')
    ) && 
    !walletSession
  ) {
    return NextResponse.json(
      { success: false, error: 'Authentication required', sessionExpired: true },
      { status: 401 }
    );
  }

  return NextResponse.next();
}
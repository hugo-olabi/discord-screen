/**
 * Vercel Serverless Function to proxy OAuth callback from https://streamroom.vercel.app/auth/v1/callback
 * to Supabase Auth's native callback endpoint with proper Host headers.
 */
export default async function handler(req: any, res: any) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://elpfsixxbdnvwxhundxl.supabase.co';
  const targetUrl = new URL('/auth/v1/callback', supabaseUrl);

  // Copy query parameters (code, state, etc.)
  const requestUrl = new URL(req.url, `https://${req.headers.host || 'streamroom.vercel.app'}`);
  requestUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.append(key, value);
  });

  try {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;

    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: {
        ...headers,
        host: new URL(supabaseUrl).host,
      },
      redirect: 'manual',
    });

    // Copy response status and headers (Location redirect, Set-Cookie, etc.)
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding' && key.toLowerCase() !== 'content-length') {
        res.setHeader(key, value);
      }
    });

    const body = await response.arrayBuffer();
    res.send(Buffer.from(body));
  } catch (err) {
    console.error('OAuth Callback Proxy Error:', err);
    res.redirect('/');
  }
}

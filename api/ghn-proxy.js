// api/ghn-proxy.js
export default async function handler(req, res) {
  console.log(`[${new Date().toISOString()}] ${req.method} request from ${req.headers['x-forwarded-for'] || req.connection.remoteAddress}`);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('CORS preflight request handled');
    return res.status(200).end();
  }

  // Only allow POST method
  if (req.method !== 'POST') {
    console.log(`Method ${req.method} not allowed`);
    return res.status(405).json({ 
      code: 405,
      message: 'Method not allowed. Use POST only.',
      data: null 
    });
  }

  try {
    const { url, data, headers } = req.body;
    
    // Validate required fields
    if (!url || !data || !headers) {
      console.log('Missing required fields:', { url: !!url, data: !!data, headers: !!headers });
      return res.status(400).json({ 
        code: 400,
        message: 'Missing required fields: url, data, headers',
        data: null
      });
    }

    // Validate GHN domain for security
    const allowedDomains = [
      'fe-online-gateway.ghn.vn',
      'dev-online-gateway.ghn.vn',
      'httpbin.org' // For testing only
    ];
    
    const urlDomain = new URL(url).hostname;
    if (!allowedDomains.some(domain => urlDomain.includes(domain))) {
      console.log(`Domain not allowed: ${urlDomain}`);
      return res.status(400).json({ 
        code: 400,
        message: `Domain ${urlDomain} is not allowed. Only GHN domains are permitted.`,
        data: null
      });
    }

    console.log(`Proxying request to: ${url}`);

    // Make request to target API
    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Vercel-Proxy/1.0',
        ...headers
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(30000) // 30 seconds timeout
    });

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    let responseData;
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }
    
    console.log(`Response received: ${response.status} in ${responseTime}ms`);

    // Return standardized response format
    const result = {
      code: response.status,
      message: response.status === 200 ? 'Success' : 'API Error',
      data: responseData,
      meta: {
        responseTime: responseTime,
        timestamp: new Date().toISOString(),
        proxy: 'vercel'
      }
    };

    return res.status(200).json(result);

  } catch (error) {
    console.error('Proxy error:', error);
    
    // Handle different types of errors
    let errorMessage = 'Internal server error';
    let errorCode = 500;
    
    if (error.name === 'AbortError') {
      errorMessage = 'Request timeout after 30 seconds';
      errorCode = 408;
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorMessage = 'Network error - unable to reach target server';
      errorCode = 502;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return res.status(errorCode).json({
      code: errorCode,
      message: errorMessage,
      data: null,
      meta: {
        error: error.name,
        timestamp: new Date().toISOString(),
        proxy: 'vercel'
      }
    });
  }
}

import { ImageResponse } from 'next/og';
import { getPost, getPosts } from '@/lib/blog';

export const runtime = 'nodejs';
export const alt = 'BrowserBash article';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams() {
    return getPosts().map((p) => ({ slug: p.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const post = getPost(slug);
    const title = (post?.title ?? 'BrowserBash').slice(0, 120);
    const category = post?.category ?? 'blog';

    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    background: '#fffdf9',
                    padding: '64px',
                    fontFamily: 'sans-serif',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                    <div style={{ width: '46px', height: '46px', background: '#ff5c1a', border: '5px solid #1a1a1a' }} />
                    <div style={{ display: 'flex', fontSize: '36px', fontWeight: 800, color: '#1a1a1a' }}>BrowserBash</div>
                    <div
                        style={{
                            display: 'flex',
                            fontSize: '20px',
                            color: '#d8430b',
                            textTransform: 'uppercase',
                            letterSpacing: '2px',
                            marginLeft: '10px',
                        }}
                    >
                        {category}
                    </div>
                </div>
                <div style={{ display: 'flex', fontSize: '62px', fontWeight: 800, color: '#1a1a1a', lineHeight: 1.12 }}>
                    {title}
                </div>
                <div style={{ display: 'flex', fontSize: '26px', color: '#6b6b6b' }}>
                    Free, open-source natural-language browser automation · browserbash.com
                </div>
            </div>
        ),
        { ...size },
    );
}

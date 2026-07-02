import { describe, expect, it } from 'vitest';

import {
  buildRelayProviderVariables,
  extractDocIdFromBundle,
  extractInstagramImagesFromWebInfo,
  extractInstagramVideoFromWebInfo,
  extractRelayProvidersFromBundle,
  extractScriptUrlsFromHtml,
  parseInstagramUrl,
  pickDashAudioUrl,
} from '../src/instagram.js';

describe('parseInstagramUrl', () => {
  it('extracts the shortcode from reel, post, reels, and tv URLs', () => {
    expect(parseInstagramUrl('https://www.instagram.com/reel/DXM1SB4EoKL/')).toEqual({
      shortcode: 'DXM1SB4EoKL',
    });
    expect(parseInstagramUrl('https://instagram.com/p/CDUMkliABpa')).toEqual({
      shortcode: 'CDUMkliABpa',
    });
    expect(parseInstagramUrl('https://www.instagram.com/reels/DXM1SB4EoKL/?igsh=abc')).toEqual({
      shortcode: 'DXM1SB4EoKL',
    });
    expect(parseInstagramUrl('https://www.instagram.com/tv/CDUMkliABpa/')).toEqual({
      shortcode: 'CDUMkliABpa',
    });
  });

  it('accepts a leading username segment', () => {
    expect(parseInstagramUrl('https://www.instagram.com/nasa/reel/DXM1SB4EoKL/')).toEqual({
      shortcode: 'DXM1SB4EoKL',
    });
  });

  it('returns null for share links (opaque token, resolves via redirect)', () => {
    expect(parseInstagramUrl('https://www.instagram.com/share/reel/BAJm2kRnVMabc/')).toBeNull();
    expect(parseInstagramUrl('https://www.instagram.com/share/BAJm2kRnVMabc/')).toBeNull();
  });

  it('returns null for profiles, stories, and garbage', () => {
    expect(parseInstagramUrl('https://www.instagram.com/nasa/')).toBeNull();
    expect(parseInstagramUrl('https://www.instagram.com/stories/nasa/123456/')).toBeNull();
    expect(parseInstagramUrl('not a url')).toBeNull();
  });
});

describe('extractDocIdFromBundle', () => {
  // Verbatim registration shape from Instagram's consolidated bundles.
  const bundle =
    '__d("PolarisClipsTabRootPaginationQuery_instagramRelayOperation",[],(function(t,n,r,o,a,i){a.exports="27865188093085062"}),null);' +
    '__d("PolarisPostRootQuery_instagramRelayOperation",[],(function(t,n,r,o,a,i){a.exports="27128499623469141"}),null);';

  it('finds the doc_id registered for the named query', () => {
    expect(extractDocIdFromBundle(bundle, 'PolarisPostRootQuery')).toBe('27128499623469141');
  });

  it('does not match other queries or absent names', () => {
    expect(extractDocIdFromBundle(bundle, 'PolarisPostActionLoadPostQueryQuery')).toBeNull();
    expect(extractDocIdFromBundle('', 'PolarisPostRootQuery')).toBeNull();
  });
});

describe('extractRelayProvidersFromBundle', () => {
  it('reads provider modules from the compiled .graphql artifact dependencies', () => {
    const bundle =
      '__d("PolarisPostRootQuery.graphql",["PolarisPostRootQuery_instagramRelayOperation",' +
      '"PolarisAIGMMediaWebLabelEnabled.relayprovider","relay-runtime"],(function(){}));';
    expect(extractRelayProvidersFromBundle(bundle, 'PolarisPostRootQuery')).toEqual([
      'PolarisAIGMMediaWebLabelEnabled.relayprovider',
    ]);
  });

  it('returns an empty list when the artifact is absent', () => {
    expect(extractRelayProvidersFromBundle('nothing here', 'PolarisPostRootQuery')).toEqual([]);
  });
});

describe('buildRelayProviderVariables', () => {
  it('names variables after the provider module with dots stripped', () => {
    expect(buildRelayProviderVariables(['PolarisAIGMMediaWebLabelEnabled.relayprovider'])).toEqual({
      __relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider: false,
    });
  });
});

describe('extractScriptUrlsFromHtml', () => {
  it('collects unique cdninstagram bundle URLs', () => {
    const html =
      '<link rel="preload" href="https://static.cdninstagram.com/rsrc.php/v4/yX/r/4wLeY5_5Fx0.js" as="script" />' +
      '<script src="https://static.cdninstagram.com/rsrc.php/v4/yX/r/4wLeY5_5Fx0.js"></script>' +
      '<script src="https://static.cdninstagram.com/rsrc.php/v4iAnT4/ys/l/en_US/abc123.js"></script>';
    expect(extractScriptUrlsFromHtml(html)).toEqual([
      'https://static.cdninstagram.com/rsrc.php/v4/yX/r/4wLeY5_5Fx0.js',
      'https://static.cdninstagram.com/rsrc.php/v4iAnT4/ys/l/en_US/abc123.js',
    ]);
  });
});

describe('pickDashAudioUrl', () => {
  const manifest = `<?xml version="1.0"?><MPD>
    <Period>
      <AdaptationSet id="0" contentType="video" par="9:16">
        <Representation id="1v" bandwidth="153305" mimeType="video/mp4">
          <BaseURL>https://scontent.cdninstagram.com/o1/v/video.mp4?a=1&amp;b=2</BaseURL>
        </Representation>
      </AdaptationSet>
      <AdaptationSet id="1" contentType="audio">
        <Representation id="2a" bandwidth="60119" codecs="mp4a.40.5" mimeType="audio/mp4">
          <BaseURL>https://scontent.cdninstagram.com/o1/v/audio.m4a?efg=abc&amp;_nc_ht=x</BaseURL>
        </Representation>
      </AdaptationSet>
    </Period></MPD>`;

  it('returns the audio AdaptationSet BaseURL with XML entities decoded', () => {
    expect(pickDashAudioUrl(manifest)).toBe(
      'https://scontent.cdninstagram.com/o1/v/audio.m4a?efg=abc&_nc_ht=x',
    );
  });

  it('returns null when there is no audio set', () => {
    expect(pickDashAudioUrl(manifest.replace('contentType="audio"', 'contentType="video"'))).toBeNull();
  });
});

function webInfo(item: Record<string, unknown>): unknown {
  return { data: { xdt_api__v1__media__shortcode__web_info: { items: [item] } } };
}

describe('extractInstagramVideoFromWebInfo', () => {
  const dash =
    '<MPD><AdaptationSet contentType="audio"><Representation>' +
    '<BaseURL>https://cdn.example/audio.m4a?x=1&amp;y=2</BaseURL>' +
    '</Representation></AdaptationSet></MPD>';

  it('prefers the audio-only DASH track and carries the caption as title', () => {
    const video = extractInstagramVideoFromWebInfo(
      webInfo({
        media_type: 2,
        video_dash_manifest: dash,
        video_versions: [{ url: 'https://cdn.example/v.mp4', width: 720, height: 1280 }],
        caption: { text: 'Artemis II +   Astronauts\n in deep space' },
      }),
    );
    expect(video).toEqual({
      videoUrl: 'https://cdn.example/audio.m4a?x=1&y=2',
      isAudioOnly: true,
      title: 'Artemis II + Astronauts in deep space',
    });
  });

  it('falls back to the smallest progressive rendition without a manifest', () => {
    const video = extractInstagramVideoFromWebInfo(
      webInfo({
        media_type: 2,
        video_dash_manifest: null,
        video_versions: [
          { url: 'https://cdn.example/big.mp4', width: 1080, height: 1920 },
          { url: 'https://cdn.example/small.mp4', width: 480, height: 854 },
        ],
      }),
    );
    expect(video).toEqual({ videoUrl: 'https://cdn.example/small.mp4', isAudioOnly: false });
  });

  it('picks the first video slide of a carousel', () => {
    const video = extractInstagramVideoFromWebInfo(
      webInfo({
        media_type: 8,
        caption: { text: 'mixed carousel' },
        carousel_media: [
          { media_type: 1 },
          { media_type: 2, video_versions: [{ url: 'https://cdn.example/slide2.mp4' }] },
        ],
      }),
    );
    expect(video).toEqual({
      videoUrl: 'https://cdn.example/slide2.mp4',
      isAudioOnly: false,
      title: 'mixed carousel',
    });
  });

  it('returns null for photo posts, empty items, and rejected responses', () => {
    expect(extractInstagramVideoFromWebInfo(webInfo({ media_type: 1 }))).toBeNull();
    expect(
      extractInstagramVideoFromWebInfo({
        data: { xdt_api__v1__media__shortcode__web_info: { items: [] } },
      }),
    ).toBeNull();
    expect(extractInstagramVideoFromWebInfo({ data: null, errors: [{}] })).toBeNull();
    expect(extractInstagramVideoFromWebInfo(null)).toBeNull();
  });
});

describe('extractInstagramImagesFromWebInfo', () => {
  it('returns the highest-resolution image of a single photo post', () => {
    expect(
      extractInstagramImagesFromWebInfo(
        webInfo({
          media_type: 1,
          image_versions2: {
            candidates: [
              { url: 'https://cdn.example/big.jpg', width: 1440, height: 808 },
              { url: 'https://cdn.example/small.jpg', width: 720, height: 404 },
            ],
          },
        }),
      ),
    ).toEqual(['https://cdn.example/big.jpg']);
  });

  it('returns one image per photo slide of a carousel', () => {
    expect(
      extractInstagramImagesFromWebInfo(
        webInfo({
          media_type: 8,
          carousel_media: [
            { media_type: 1, image_versions2: { candidates: [{ url: 'https://cdn.example/1.jpg' }] } },
            { media_type: 1, image_versions2: { candidates: [{ url: 'https://cdn.example/2.jpg' }] } },
          ],
        }),
      ),
    ).toEqual(['https://cdn.example/1.jpg', 'https://cdn.example/2.jpg']);
  });

  it('returns no images for video posts and rejected responses', () => {
    expect(
      extractInstagramImagesFromWebInfo(
        webInfo({
          media_type: 2,
          image_versions2: { candidates: [{ url: 'https://cdn.example/thumb.jpg' }] },
          video_versions: [{ url: 'https://cdn.example/v.mp4' }],
        }),
      ),
    ).toEqual([]);
    expect(extractInstagramImagesFromWebInfo({ data: null })).toEqual([]);
    expect(extractInstagramImagesFromWebInfo(null)).toEqual([]);
  });
});

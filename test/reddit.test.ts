import { describe, expect, it } from 'vitest';

import {
  buildChallengeAnswerUrl,
  extractRedditImagesFromPostHtml,
  extractRedditVideoFromPostHtml,
  parseRedditChallenge,
} from '../src/reddit.js';

const CHALLENGE_PAGE = `
  <title>Reddit - Please wait for verification</title>
  <script nonce="x">
    document.addEventListener("DOMContentLoaded",async function(){var e=document.forms[0],n=(e.onsubmit=function(t){return new URLSearchParams(document.location.search).forEach((e,n)=>t.target.appendChild(Object.assign(document.createElement("input"),{name:n,type:"hidden",value:e}))),!0},await(async e=>e+e)("75107adb7fad482b"));e.elements.namedItem("solution").value=n,e.requestSubmit()},{once:!0});
  </script>
  <form hidden method="GET" action="/r/funny/comments/1u2mmyq/how_to_keep_your_fish_in_shape/">
    <input type="hidden" name="solution" />
    <input type="hidden" name="js_challenge" value="1"/>
    <input type="hidden" name="token" value="7afd7253fec22262ff1c52b1703fe9ec"/>
    <input type="hidden" name="jsc_orig_r" value=""/>
  </form>`;

describe('parseRedditChallenge', () => {
  it('extracts the seed and token, doubling the seed for the solution', () => {
    expect(parseRedditChallenge(CHALLENGE_PAGE)).toEqual({
      solution: '75107adb7fad482b75107adb7fad482b',
      token: '7afd7253fec22262ff1c52b1703fe9ec',
    });
  });

  it('returns null for a regular post page', () => {
    expect(parseRedditChallenge('<html><shreddit-player src="x"></shreddit-player></html>')).toBeNull();
  });

  it('returns null when the challenge script shape is unrecognized', () => {
    const mutated = CHALLENGE_PAGE.replace('e=>e+e', 'e=>e+e+e');
    expect(parseRedditChallenge(mutated)).toBeNull();
  });
});

describe('buildChallengeAnswerUrl', () => {
  it('appends the form fields as query params', () => {
    const url = buildChallengeAnswerUrl('https://www.reddit.com/r/funny/comments/1u2mmyq/title/', {
      solution: 'aabb',
      token: 'tok',
    });
    expect(url).toBe(
      'https://www.reddit.com/r/funny/comments/1u2mmyq/title/?solution=aabb&js_challenge=1&token=tok&jsc_orig_r=',
    );
  });

  it('preserves existing query params, as the challenge form does', () => {
    const url = new URL(
      buildChallengeAnswerUrl('https://www.reddit.com/r/funny/comments/1u2mmyq/title/?utm_source=share', {
        solution: 'aabb',
        token: 'tok',
      }),
    );
    expect(url.searchParams.get('utm_source')).toBe('share');
    expect(url.searchParams.get('solution')).toBe('aabb');
  });
});

describe('extractRedditVideoFromPostHtml', () => {
  const MAIN_PLAYER =
    '<shreddit-player src="https://v.redd.it/ye6kryzzfk6h1/HLSPlaylist.m3u8?f=sd&amp;v=1&amp;a=1783744530%2CZWY4" ' +
    'caption-url="https://v.redd.it/ye6kryzzfk6h1/wh_ben_en.vtt">';
  const AD_PLAYER =
    '<shreddit-player src="https://v.redd.it/ho4efm46ezzg1/HLSPlaylist.m3u8?f=hd&amp;a=999" ' +
    'post-promoted post-domain="example.com" post-id="t3_ad1">';

  it('extracts the stream URL and decodes entities', () => {
    const html = `<shreddit-title title="How to keep your fish in shape : r/funny">${MAIN_PLAYER}`;
    expect(extractRedditVideoFromPostHtml(html)).toEqual({
      videoUrl: 'https://v.redd.it/ye6kryzzfk6h1/HLSPlaylist.m3u8?f=sd&v=1&a=1783744530%2CZWY4',
      title: 'How to keep your fish in shape',
    });
  });

  it('skips promoted (ad) players that precede the post video', () => {
    const html = AD_PLAYER + MAIN_PLAYER;
    expect(extractRedditVideoFromPostHtml(html)?.videoUrl).toContain('ye6kryzzfk6h1');
  });

  it('accepts versioned player tags like <shreddit-player-2>', () => {
    const html = MAIN_PLAYER.replace('<shreddit-player ', '<shreddit-player-2 ');
    expect(extractRedditVideoFromPostHtml(html)?.videoUrl).toContain('ye6kryzzfk6h1');
  });

  it('ignores players whose src is not a v.redd.it stream', () => {
    const html =
      '<shreddit-player src="https://external-preview.redd.it/abc.gif?width=200&amp;format=mp4">';
    expect(extractRedditVideoFromPostHtml(html)).toBeNull();
  });

  it('returns null when the page has no video player', () => {
    expect(extractRedditVideoFromPostHtml('<html><body>text post</body></html>')).toBeNull();
  });

  it('returns null for image/gallery posts even when a player is present', () => {
    // Reddit sometimes injects an auto-generated video rendition into image
    // post pages: <shreddit-player src="https://v.redd.it/link/<post>/asset/...">.
    const html =
      '<shreddit-post permalink="/r/pics/comments/1uhbo1x/t/" post-type="image" ' +
      'content-href="https://i.redd.it/idnqwnbfnv9h1.jpeg">' +
      '<shreddit-player src="https://v.redd.it/link/1uhbo1x/asset/luzyg0pjx0ah1/HLSPlaylist.m3u8?f=hd&amp;v=1">';
    expect(extractRedditVideoFromPostHtml(html)).toBeNull();
  });

  it('omits the title when no <shreddit-title> is present', () => {
    expect(extractRedditVideoFromPostHtml(MAIN_PLAYER)).toEqual({
      videoUrl: 'https://v.redd.it/ye6kryzzfk6h1/HLSPlaylist.m3u8?f=sd&v=1&a=1783744530%2CZWY4',
      title: undefined,
    });
  });
});

describe('extractRedditImagesFromPostHtml', () => {
  // Attribute order and hosts mirror a real post page (r/pics, Jun 2026).
  const IMAGE_POST =
    '<shreddit-post permalink="/r/pics/comments/1uhbo1x/title/" ' +
    'content-href="https://i.redd.it/idnqwnbfnv9h1.jpeg" domain="i.redd.it" ' +
    'post-type="image" post-title="A sign">';

  // Gallery slides render a blurred backdrop <img> plus the lightbox <img>;
  // the first slide is eager (src/srcset), later ones lazy (data-lazy-*).
  const GALLERY_POST =
    '<shreddit-post permalink="/r/analog/comments/1um8n56/title/" ' +
    'content-href="https://www.reddit.com/gallery/1um8n56" post-type="gallery">' +
    '<gallery-carousel>' +
    '<img class="post-background-image-filter z-0" src="https://preview.redd.it/one-v0-aaa.jpg?width=640&amp;crop=smart&amp;auto=webp&amp;s=blur">' +
    '<img class="media-lightbox-img h-full" src="https://preview.redd.it/one-v0-aaa.jpg?width=640&amp;crop=smart&amp;auto=webp&amp;s=sig640" ' +
    'srcset="https://preview.redd.it/one-v0-aaa.jpg?width=320&amp;s=sig320 320w, https://preview.redd.it/one-v0-aaa.jpg?width=1080&amp;s=sig1080 1080w, https://preview.redd.it/one-v0-aaa.jpg?width=640&amp;s=sig640 640w">' +
    '<img class="post-background-image-filter z-0" data-lazy-src="https://preview.redd.it/two-v0-bbb.jpg?width=640&amp;s=blur2">' +
    '<img class="media-lightbox-img h-full" data-lazy-src="https://preview.redd.it/two-v0-bbb.jpg?width=640&amp;s=lazy640" ' +
    'data-lazy-srcset="https://preview.redd.it/two-v0-bbb.jpg?width=320&amp;s=lazy320 320w, https://preview.redd.it/two-v0-bbb.jpg?width=1080&amp;s=lazy1080 1080w">' +
    '</gallery-carousel>';

  it('returns the full-resolution content-href of a single image post', () => {
    expect(extractRedditImagesFromPostHtml(IMAGE_POST)).toEqual(['https://i.redd.it/idnqwnbfnv9h1.jpeg']);
  });

  it('returns one image per gallery slide, preferring the largest srcset candidate', () => {
    expect(extractRedditImagesFromPostHtml(GALLERY_POST)).toEqual([
      'https://preview.redd.it/one-v0-aaa.jpg?width=1080&s=sig1080',
      'https://preview.redd.it/two-v0-bbb.jpg?width=1080&s=lazy1080',
    ]);
  });

  it('falls back to src when a lightbox img has no srcset', () => {
    const html =
      '<shreddit-post post-type="gallery" content-href="https://www.reddit.com/gallery/x">' +
      '<gallery-carousel><img class="media-lightbox-img" src="https://preview.redd.it/solo.jpg?s=1"></gallery-carousel>';
    expect(extractRedditImagesFromPostHtml(html)).toEqual(['https://preview.redd.it/solo.jpg?s=1']);
  });

  it('ignores images that are not Reddit-hosted post media', () => {
    const external = IMAGE_POST.replace('https://i.redd.it/idnqwnbfnv9h1.jpeg', 'https://i.imgur.com/x.jpg');
    expect(extractRedditImagesFromPostHtml(external)).toEqual([]);
  });

  it('returns [] for text posts and pages without a rendered post', () => {
    expect(
      extractRedditImagesFromPostHtml('<shreddit-post post-type="text" permalink="/r/x/comments/1/t/">'),
    ).toEqual([]);
    expect(extractRedditImagesFromPostHtml('<html><body>interstitial</body></html>')).toEqual([]);
  });
});

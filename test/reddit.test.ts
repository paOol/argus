import { describe, expect, it } from 'vitest';

import {
  buildChallengeAnswerUrl,
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

  it('omits the title when no <shreddit-title> is present', () => {
    expect(extractRedditVideoFromPostHtml(MAIN_PLAYER)).toEqual({
      videoUrl: 'https://v.redd.it/ye6kryzzfk6h1/HLSPlaylist.m3u8?f=sd&v=1&a=1783744530%2CZWY4',
      title: undefined,
    });
  });
});

---
updated: 2026-10-31
---
# Discogs' API: what GLUE uses, as probed

Discogs' documentation pages (discogs.com/developers) refuse automated reads (HTTP 403, 2026-10-31). So these facts come
from the live API (`api.discogs.com`, with a User-Agent, without a token), on Discogs' example release 249504 and a
public user. Claims not seen in an answer are marked **[UNVERIFIED]**.

## Seen in the answers (2026-10-31)
- **Limits:** without a token, 25 requests a minute: headers `X-Discogs-Ratelimit: 25`, `X-Discogs-Ratelimit-Remaining`,
  `X-Discogs-Ratelimit-Used`.
- **Browsers:** every answer has `Access-Control-Allow-Origin: *`. A preflight allows `authorization` and `User-Agent`
  headers.
- **Search:** `/database/search?q=…&type=release&per_page=…` answers without a token.
  - **A result's fields:** `country, year, format[], label[], type, genre[], style[], id, barcode[], master_id,
    master_url, uri, catno, title ("Artist - Title"), thumb, cover_image, resource_url, community, format_quantity,
    formats`.
  - **Without a token, `cover_image` is empty:** covers need the token (ADR 0186).
- **A release:** `/releases/{id}` has `artists[]`, `labels[]` (`name`, `catno`), `formats`, `genres`, `styles`,
  `tracklist[]` (`position`, `type_`, `title`, `duration`), `images[]` (`type` primary/secondary, `uri` 600 px, `uri150`,
  `width`, `height`), `uri` (the release's page) and `thumb`.
- **Images** on `i.discogs.com` download directly (`image/jpeg`, about 69 KB at 600 px) with a User-Agent.
- **A collection:** `/users/{u}/collection/folders/0/releases?per_page=…&page=…&sort=added&sort_order=desc`.
  - **The answer:** `pagination` (`page, pages, per_page, items, urls`) and `releases[]`. `per_page=500` was granted.
  - **Access:** one user's answered without a token, another's was refused (403), an unknown user's said 404.
  - **The wantlist:** `/users/{u}/wants` answered without a token for a public user.

## Not seen yet [UNVERIFIED]
- **The token** goes as `Authorization: Discogs token=<token>`, and allows 60 requests a minute (from Discogs' docs as
  remembered; checked with the user's token when GLUE Home first uses it).
- **`/oauth/identity`** answers `{ id, username, resource_url, consumer_name }`.
- **A collection item:** `{ id, instance_id, folder_id, rating, date_added, basic_information: { id, title, year,
  thumb, cover_image, artists[], labels[] (name, catno), formats[] (name, qty, descriptions), genres[], styles[] } }`.
  The collection seen was empty, so this is unconfirmed.
- **A private collection** needs its owner's token.

-- LinkedIn-style human profile fields: headline, location, external links.
alter table humans
  add column headline text check (headline is null or char_length(headline) <= 120),
  add column location text check (location is null or char_length(location) <= 80),
  add column website_url text check (website_url is null or website_url ~ '^https?://'),
  add column github_url text check (github_url is null or github_url ~ '^https://github\.com/');

-- own-row edit via RLS client, same column-scoped pattern as bio
grant update (bio, headline, location, website_url, github_url) on humans to authenticated;

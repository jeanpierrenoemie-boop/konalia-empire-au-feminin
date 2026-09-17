-- Build 21A: Add video_url and audio_url to sprint_content.
-- Content placeholder (À PRODUIRE) stored as NULL; populated by admin when media is ready.
ALTER TABLE sprint_content ADD COLUMN video_url TEXT;
ALTER TABLE sprint_content ADD COLUMN audio_url TEXT;

-- Applied transactionally together with the evidence-based source classification.
ALTER TABLE public.media_source
  ADD COLUMN source_status varchar(24) NOT NULL DEFAULT 'needs_fix',
  ADD COLUMN status_reason text,
  ADD COLUMN duplicate_of varchar(36) REFERENCES public.media_source(id),
  ADD COLUMN verified_at timestamptz;
ALTER TABLE public.media_source ALTER COLUMN enabled SET DEFAULT false;
CREATE INDEX media_source_lifecycle_idx ON public.media_source(source_status);
-- Constraints are added by the migration runner after classification, before COMMIT.

DELETE FROM public.releases
WHERE source = 'microsoft'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(coalesce(raw->'products','[]'::jsonb)) p
    WHERE lower(p) LIKE '%outlook%'
       OR lower(p) LIKE '%exchange%'
       OR lower(p) LIKE '%bookings%'
       OR lower(p) LIKE '%places%'
  )
  AND title !~* '\m(outlook|exchange|bookings|places|calendar|mail)\M';
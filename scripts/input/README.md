# scripts/input/

Drop-in folder for files you hand me manually instead of me fetching them
(e.g. a Google My Maps KML export, per §2.5 of the project spec). Anything
placed here is checked by the pipeline scripts *before* they try a network
fetch, and is gitignored — these are your personal working files, not
published content.

// Single source of truth for the Hut record shape. The TS type (Hut, below)
// and src/data/huts.schema.json (via `npm run schema:gen`) are both derived
// from this schema so they can't drift apart.
import { z } from 'zod';

export const CategorySchema = z.enum(['bivacco', 'rifugio']);
export const ServiceLevelSchema = z.enum(['staffed', 'self_service', 'unstaffed', 'unknown']);
export const CategoryConfidenceSchema = z.enum(['high', 'medium', 'low']);
export const LinkKindSchema = z.enum(['wikipedia', 'official', 'cai', 'osm', 'other']);

// ISO-3166-1 alpha-2, e.g. "IT", "NO". Deliberately a bare string (not an
// enum of the two countries we start with) so adding a region later is a
// regions.config.ts edit, not a schema change.
const CountryCodeSchema = z.string().length(2).toUpperCase();

const NearestPeakSchema = z.object({
  name: z.string(),
  ele: z.number().nullable(),
  distance_m: z.number().nonnegative(),
});

const LocationSchema = z.object({
  country: CountryCodeSchema,
  region: z.string().nullable(),
  province: z.string().nullable(),
  municipality: z.string().nullable(),
  mountain_group: z.string().nullable(),
  nearest_peak: NearestPeakSchema.nullable(),
});

const PriceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('free') }),
  z.object({
    type: z.literal('paid'),
    // ISO 4217, e.g. "EUR", "NOK". Bare string for the same reason as country.
    currency: z.string().length(3).nullable(),
    night_from: z.number().nonnegative().nullable(),
    night_to: z.number().nonnegative().nullable(),
    half_board_from: z.number().nonnegative().nullable(),
    cai_member_discount: z.boolean().nullable(),
    source_url: z.url().nullable(),
    checked_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  }),
]);

const FacilitiesSchema = z.object({
  fireplace: z.boolean().nullable(),
  stove: z.boolean().nullable(),
  drinking_water: z.boolean().nullable(),
  blankets: z.boolean().nullable(),
  toilet: z.boolean().nullable(),
  winter_room: z.boolean().nullable(),
});

const AccessSchema = z.object({
  opening_hours: z.string().nullable(),
  access_note_it: z.string().nullable(),
  access_note_en: z.string().nullable(),
});

const ContactSchema = z.object({
  phone: z.string().nullable(),
  email: z.email().nullable(),
  website: z.url().nullable(),
});

const DescriptionSchema = z.object({
  it: z.string().nullable(),
  en: z.string().nullable(),
});

const PhotoSchema = z.object({
  url: z.url(),
  thumb_url: z.url(),
  author: z.string(),
  license: z.string(),
  source_url: z.url(),
});

const LinkSchema = z.object({
  label: z.string(),
  url: z.url(),
  kind: LinkKindSchema,
});

const SourceSchema = z.object({
  name: z.string(),
  url: z.url(),
  fetched_at: z.iso.datetime({ offset: true }),
});

const NamesSchema = z
  .object({
    it: z.string().optional(),
    en: z.string().optional(),
    no: z.string().optional(),
    de: z.string().optional(),
    fr: z.string().optional(),
  })
  .partial();

export const HutSchema = z.object({
  id: z.string().min(1),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case'),
  name: z.string().min(1),
  names: NamesSchema,
  category: CategorySchema,
  // Raw OSM tourism/amenity+shelter_type tag, kept alongside `category` so a
  // heuristic reclassification is never silently lossy (see §2.1 of the spec).
  osm_type: z.string().nullable(),
  service_level: ServiceLevelSchema,
  category_confidence: CategoryConfidenceSchema,
  coords: z.object({
    lat: z.number().gte(-90).lte(90),
    lon: z.number().gte(-180).lte(180),
  }),
  elevation_m: z.number().nullable(),
  location: LocationSchema,
  capacity: z.number().int().positive().nullable(),
  operator: z.string().nullable(),
  price: PriceSchema,
  facilities: FacilitiesSchema,
  access: AccessSchema,
  contact: ContactSchema,
  description: DescriptionSchema,
  photos: z.array(PhotoSchema),
  links: z.array(LinkSchema),
  sources: z.array(SourceSchema).min(1),
  verified: z.boolean(),
  updated_at: z.iso.datetime({ offset: true }),
});

export type Hut = z.infer<typeof HutSchema>;
export type Price = z.infer<typeof PriceSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type ServiceLevel = z.infer<typeof ServiceLevelSchema>;
export type CategoryConfidence = z.infer<typeof CategoryConfidenceSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type Facilities = z.infer<typeof FacilitiesSchema>;
export type Photo = z.infer<typeof PhotoSchema>;
export type Link = z.infer<typeof LinkSchema>;
export type Source = z.infer<typeof SourceSchema>;

// Editorial discovery shortcuts. A collection is not a membership claim.
// Keep substantive seeds explicit; never collect organisations by country/prefix.
export const COLLECTIONS = Object.freeze({
  gdi: {
    label: 'GDI',
    seedIds: ['gdi-infrastructuur', 'solution-gdi-digid', 'solution-gdi-digipoort',
      'solution-gdi-digikoppeling', 'solution-gdi-mijnoverheid', 'solution-gdi-diginetwerk'],
  },
  national: {
    label: 'Rijk',
    seedIds: ['gdi-infrastructuur', 'solution-gdi-digid', 'solution-gdi-digipoort',
      'solution-gdi-digikoppeling', 'solution-gdi-mijnoverheid', 'solution-gdi-diginetwerk'],
    programmeIds: ['nds-nederlandse-digitaliseringsstrategie', 'nds-federatief-datastelsel',
      'nds-informatiepunten-digitale-overheid', 'nts-strategy', 'nts-ai-data', 'nts-osip'],
  },
  municipal: {
    label: 'Gemeenten & VNG',
    seedIds: ['municipal-common-ground', 'solution-municipal-haal-centraal',
      'solution-municipal-nl-design-system', 'solution-municipal-mijnservices',
      'solution-municipal-open-klant', 'solution-municipal-podiumd',
      'solution-open-zaak', 'solution-open-formulieren', 'solution-open-inwoner'],
  },
  provincial: {
    label: 'Provincies',
    seedIds: ['provincial-nds-samenwerking', 'provincial-informatiehuishouding-2026-2030',
      'provincial-overijssel-mobiliteitsdata', 'solution-provincial-ggo-digital-twin',
      'solution-provincial-open-data-zuid-holland', 'solution-provincial-ndff',
      'solution-provincial-besi', 'solution-provincial-nvi'],
  },
  eu: {
    label: 'Europese digitalisering',
    seedIds: ['eu-digital-programme', 'eu-digital-interoperable-europe', 'eu-digital-eudi-wallet',
      'solution-eu-digital-oots', 'solution-eu-digital-edelivery', 'solution-eu-digital-dss',
      'solution-eu-digital-interop-assessment', 'solution-eu-digital-wallet-reference',
      'solution-eu-digital-dc4eu', 'solution-eu-digital-oss-catalogue'],
  },
  canada: {
    label: 'Canada',
    seedIds: ['ca-innovative-solutions-canada', 'ca-dpi-roundtables-2026',
      'solution-ca-gc-notify', 'solution-ca-gc-forms', 'solution-ca-gc-design-system',
      'solution-ca-canadalogin', 'solution-ca-gc-issue-verify',
      'solution-ca-algorithmic-impact-assessment', 'solution-ca-gc-ai-register',
      'solution-ca-open-government-portal', 'solution-ca-canadabuys', 'solution-ca-pctf',
      'solution-ca-bc-services-card-login', 'solution-ca-bc-chefs',
      'solution-ca-ontario-design-system', 'solution-ca-donnees-quebec',
      'solution-ca-alberta-ca-account', 'solution-ca-calgary-open-data'],
  },
  'eu-canada': {
    label: 'EU–Canada',
    seedIds: ['ca-eu-digital-partnership', 'bridge-ngi-sargasso', 'solution-bridge-ebsi-can', 'solution-bridge-ddip',
      'solution-bridge-d3ica', 'solution-bridge-interop4did'],
  },
});
for (const collection of Object.values(COLLECTIONS)) {
  Object.freeze(collection.seedIds);
  if (collection.programmeIds) Object.freeze(collection.programmeIds);
  Object.freeze(collection);
}

/** Return existing seeds and their direct organisations/collaborations only.
 * No recursion: an owner's other products or a programme's other participants
 * cannot enter a collection through an inferred relationship.
 */
export function collectionIds(catalogue, key) {
  const definition = Object.hasOwn(COLLECTIONS, key) ? COLLECTIONS[key] : null;
  if (!definition) return new Set();
  const byId = new Map((catalogue.entities || []).map(entity => [entity.id, entity]));
  const included = new Set();
  for (const id of definition.seedIds) {
    const seed = byId.get(id);
    if (!seed || !['innovation', 'collaboration'].includes(seed.entity_type)) continue;
    included.add(id);
    for (const orgId of seed.organisation_ids || []) {
      if (byId.get(orgId)?.entity_type === 'organisation') included.add(orgId);
    }
    for (const collaborationId of seed.collaboration_ids || []) {
      if (byId.get(collaborationId)?.entity_type === 'collaboration') included.add(collaborationId);
    }
  }
  // Preserve the former NDS/NTS selections: only explicitly linked participants
  // and solutions of these programmes, without expanding through their owners.
  for (const id of definition.programmeIds || []) {
    const programme = byId.get(id);
    if (programme?.entity_type !== 'collaboration') continue;
    included.add(id);
    for (const related of [...(programme.organisation_ids || []), ...(programme.innovation_ids || [])]) {
      if (byId.has(related)) included.add(related);
    }
  }
  return included;
}

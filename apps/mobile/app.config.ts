import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Configuration dynamique — complète app.json.
 *
 * La clé OpenAIP est lue dans l'environnement, et n'apparaît donc pas dans le
 * dépôt. Elle reste facultative : sans elle la carte perd sa surcouche
 * aéronautique, mais les alertes n'en dépendent pas.
 *
 * Une clé injectée ici se retrouve dans le binaire, où elle est extractible ;
 * les versions distribuées sont donc compilées sans clé, chaque utilisateur
 * saisissant la sienne dans Menu → Profil. Voir README, section « Clé OpenAIP ».
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
    ...config,
    name: config.name ?? 'AeroVigi',
    slug: config.slug ?? 'aerovigi',
    extra: {
        ...config.extra,
        openAipKey: process.env.AEROVIGI_OPENAIP_KEY ?? '',
    },
});

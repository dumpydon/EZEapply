import { watchAppearance } from './appearance';

// Each extension document owns one theme listener, separate from its UI bundles.
watchAppearance(document);

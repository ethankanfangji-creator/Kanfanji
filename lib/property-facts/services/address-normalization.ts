import { normalizeAddressQuery } from "../normalize-address";
import type { AddressNormalizationService, NormalizedAddress } from "../interfaces";

export class DefaultAddressNormalizationService implements AddressNormalizationService {
  normalize(raw: string): NormalizedAddress {
    return normalizeAddressQuery(raw);
  }
}

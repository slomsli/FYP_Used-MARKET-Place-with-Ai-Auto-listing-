export interface DeliveryDisputeDetails {
  offerId: string | null;
  agreedPriceLabel: string | null;
  paymentReference: string | null;
  proofUrls: string[];
  buyerStatement: string;
}

export interface BuildDeliveryDisputeInput {
  offerId: string;
  agreedPriceLabel: string;
  paymentReference?: string | null;
  proofUrls?: string[];
  buyerStatement: string;
}

const DELIVERY_DISPUTE_HEADER = 'Delivery issue report';
const OFFER_PREFIX = 'Offer ID: ';
const PRICE_PREFIX = 'Agreed price: ';
const PAYMENT_PREFIX = 'Payment reference: ';
const PROOF_PREFIX = 'Proof URL: ';
const STATEMENT_PREFIX = 'Buyer statement:';

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}

export function buildDeliveryDisputeDetails(
  input: BuildDeliveryDisputeInput
): string {
  const lines: string[] = [
    DELIVERY_DISPUTE_HEADER,
    `${OFFER_PREFIX}${input.offerId}`,
    `${PRICE_PREFIX}${input.agreedPriceLabel}`,
  ];

  const paymentReference = normalizeOptionalText(input.paymentReference);
  if (paymentReference) {
    lines.push(`${PAYMENT_PREFIX}${paymentReference}`);
  }

  const proofUrls = Array.from(
    new Set((input.proofUrls ?? []).map((proofUrl) => proofUrl.trim()).filter(Boolean))
  );

  for (const proofUrl of proofUrls) {
    lines.push(`${PROOF_PREFIX}${proofUrl}`);
  }

  lines.push(STATEMENT_PREFIX);
  lines.push(input.buyerStatement.trim());

  return lines.join('\n');
}

export function parseDeliveryDisputeDetails(
  value: string | null | undefined
): DeliveryDisputeDetails | null {
  const normalizedValue = normalizeOptionalText(value);
  if (!normalizedValue) {
    return null;
  }

  const lines = normalizedValue.split(/\r?\n/);
  if (lines[0]?.trim() !== DELIVERY_DISPUTE_HEADER) {
    return null;
  }

  let offerId: string | null = null;
  let agreedPriceLabel: string | null = null;
  let paymentReference: string | null = null;
  const proofUrls: string[] = [];
  let statementStartIndex = -1;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';

    if (!line) {
      continue;
    }

    if (line.startsWith(OFFER_PREFIX)) {
      offerId = normalizeOptionalText(line.slice(OFFER_PREFIX.length));
      continue;
    }

    if (line.startsWith(PRICE_PREFIX)) {
      agreedPriceLabel = normalizeOptionalText(line.slice(PRICE_PREFIX.length));
      continue;
    }

    if (line.startsWith(PAYMENT_PREFIX)) {
      paymentReference = normalizeOptionalText(line.slice(PAYMENT_PREFIX.length));
      continue;
    }

    if (line.startsWith(PROOF_PREFIX)) {
      const proofUrl = normalizeOptionalText(line.slice(PROOF_PREFIX.length));
      if (proofUrl) {
        proofUrls.push(proofUrl);
      }
      continue;
    }

    if (line === STATEMENT_PREFIX) {
      statementStartIndex = index + 1;
      break;
    }
  }

  const buyerStatement =
    statementStartIndex === -1
      ? ''
      : lines.slice(statementStartIndex).join('\n').trim();

  if (!buyerStatement) {
    return null;
  }

  return {
    offerId,
    agreedPriceLabel,
    paymentReference,
    proofUrls,
    buyerStatement,
  };
}

export function isDeliveryDisputeDetails(
  value: string | null | undefined
): boolean {
  return parseDeliveryDisputeDetails(value) !== null;
}

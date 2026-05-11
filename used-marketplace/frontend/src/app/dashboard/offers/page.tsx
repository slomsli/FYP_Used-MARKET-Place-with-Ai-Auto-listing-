'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import {
  getReceivedOffers,
  getSentOffers,
  acceptOffer,
  rejectOffer,
  cancelOffer,
  counterOffer,
  submitBuyerReview,
  submitSellerReviewResponse,
  type OfferSummary,
} from '@/src/services/offerService';
import { ROUTES } from '@/src/config/routes';
import styles from './offers.module.css';

function formatCurrency(amount: number, currency = 'MYR') {
  const hasFraction = !Number.isInteger(amount);

  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency,
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(isoString: string) {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatDateTime(isoString: string) {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function buildMessageHref(listingId: string, recipientId: string, recipientName: string) {
  const params = new URLSearchParams({
    listingId,
    recipientId,
    recipientName,
  });

  return `${ROUTES.MESSAGES}?${params.toString()}`;
}

function buildDeliveryIssueHref(offer: OfferSummary) {
  const params = new URLSearchParams({
    listingId: offer.listingId,
    offerId: offer.id,
    orderId: offer.id,
    title: offer.listing.title,
    amount: formatCurrency(offer.offerPrice, offer.listing.currency),
    seller: offer.seller.displayName,
    scope: 'delivery',
    source: 'offers',
  });

  return `${ROUTES.REPORT}?${params.toString()}`;
}

type OfferTab = 'received' | 'sent';
type SummaryTone = 'action' | 'waiting' | 'neutral';

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.7 6.7 19.1l1-5.8L3.5 9.2l5.9-.9L12 3Z" />
    </svg>
  );
}

function getOfferInitiatorId(offer: OfferSummary) {
  if (offer.initiatedBy === offer.buyerId || offer.initiatedBy === offer.sellerId) {
    return offer.initiatedBy;
  }

  return offer.offerKind === 'counter_offer' ? offer.sellerId : offer.buyerId;
}

function getOfferResponderId(offer: OfferSummary) {
  const initiatorId = getOfferInitiatorId(offer);
  return initiatorId === offer.buyerId ? offer.sellerId : offer.buyerId;
}

function getOfferTypeLabel(offer: OfferSummary) {
  if (offer.offerKind === 'purchase_request') {
    return 'purchase request';
  }

  if (offer.offerKind === 'counter_offer') {
    return 'counter-offer';
  }

  return 'offer';
}

function getOfferPresentation(
  offer: OfferSummary,
  tab: OfferTab,
  currentUserId: string | null
) {
  const isReceived = tab === 'received';
  const initiatorId = getOfferInitiatorId(offer);
  const responderId = getOfferResponderId(offer);
  const isInitiatedByCurrentUser = currentUserId === initiatorId;
  const isWaitingForCurrentUser =
    offer.status === 'pending' && currentUserId !== null && responderId === currentUserId;
  const isCompletedSale = offer.status === 'accepted' && offer.listing.status === 'sold';
  const formattedPrice = formatCurrency(offer.offerPrice, offer.listing.currency);
  const typeLabel = getOfferTypeLabel(offer);
  const messageAuthor =
    initiatorId === offer.sellerId ? offer.seller.displayName : offer.buyer.displayName;

  let summaryTone: SummaryTone = 'neutral';
  let summaryText = '';
  let summarySubtext: string | null = null;

  if (offer.status === 'pending') {
    if (initiatorId === offer.sellerId) {
      if (isReceived) {
        summaryTone = 'waiting';
        summaryText = `You counter-offered ${formattedPrice}. Waiting for the buyer's response.`;
        summarySubtext =
          'Your earlier buyer offer is closed. The buyer now decides whether to accept, reject, or send another offer.';
      } else {
        summaryTone = 'action';
        summaryText = `Seller counter-offered ${formattedPrice}. Do you want to accept this price?`;
        summarySubtext =
          'Your earlier offer is closed. This seller proposal is now waiting for your response.';
      }
    } else if (isReceived) {
      summaryTone = 'action';
      if (offer.offerKind === 'purchase_request') {
        summaryText = `Buyer requested to purchase this item for ${formattedPrice}.`;
      } else if (offer.offerKind === 'counter_offer') {
        summaryText = `Buyer counter-offered ${formattedPrice}.`;
      } else {
        summaryText = `Buyer offered ${formattedPrice}.`;
      }
      summarySubtext = 'You can accept it, reject it, or send a counter-offer.';
    } else {
      summaryTone = 'waiting';
      if (offer.offerKind === 'purchase_request') {
        summaryText = `Your purchase request for ${formattedPrice} is waiting for the seller's response.`;
      } else if (offer.offerKind === 'counter_offer') {
        summaryText = `Your counter-offer of ${formattedPrice} is waiting for the seller's response.`;
      } else {
        summaryText = `Your offer of ${formattedPrice} is waiting for the seller's response.`;
      }
    }
  } else if (offer.status === 'accepted') {
    if (isCompletedSale) {
      summaryText = isReceived
        ? `You sold this item to ${offer.buyer.displayName} for ${formattedPrice}.`
        : `You bought this item for ${formattedPrice}.`;
      summarySubtext = isReceived
        ? 'The listing is now marked as sold to this buyer.'
        : 'The seller accepted your final price, and the listing is now marked as sold to you.';
    } else if (initiatorId === offer.sellerId) {
      summaryText = isReceived
        ? `Your counter-offer at ${formattedPrice} was accepted.`
        : `You accepted the seller's counter-offer at ${formattedPrice}.`;
    } else {
      summaryText = isReceived
        ? `You accepted the buyer's ${typeLabel} at ${formattedPrice}.`
        : `Your ${typeLabel} at ${formattedPrice} was accepted.`;
    }
  } else if (offer.status === 'rejected') {
    if (initiatorId === offer.sellerId) {
      summaryText = isReceived
        ? `Your counter-offer at ${formattedPrice} was rejected.`
        : `You rejected the seller's counter-offer at ${formattedPrice}.`;
    } else {
      summaryText = isReceived
        ? `You rejected the buyer's ${typeLabel} at ${formattedPrice}.`
        : `Your ${typeLabel} at ${formattedPrice} was rejected.`;
    }
  } else if (offer.status === 'withdrawn') {
    summaryText = isReceived
      ? `This competing ${typeLabel} was automatically closed after you sold the item elsewhere.`
      : `Your ${typeLabel} at ${formattedPrice} was automatically closed because another buyer completed the sale first.`;
    summarySubtext = isReceived
      ? 'The listing is already sold, so this thread is archived as a competing offer.'
      : 'This was not manually rejected by the seller. The item was sold through a different accepted offer.';
  } else {
    summaryText = isInitiatedByCurrentUser
      ? offer.offerKind === 'counter_offer'
        ? `You withdrew your counter-offer at ${formattedPrice}.`
        : `You cancelled your ${typeLabel} at ${formattedPrice}.`
      : `This ${typeLabel} at ${formattedPrice} was cancelled.`;
  }

  const proposalPriceLabel = isInitiatedByCurrentUser
    ? offer.offerKind === 'counter_offer'
      ? 'Your Counter Price'
      : offer.offerKind === 'purchase_request'
        ? 'Your Requested Price'
        : 'Your Offer Price'
    : initiatorId === offer.sellerId
      ? "Seller's Price"
      : "Buyer's Price";

  const statusLabel =
    isCompletedSale
      ? 'Sold'
      : offer.status === 'pending'
      ? isWaitingForCurrentUser
        ? 'Action needed'
        : 'Waiting'
      : offer.status === 'withdrawn'
      ? 'Withdrawn'
      : offer.status;

  return {
    isInitiatedByCurrentUser,
    isWaitingForCurrentUser,
    messageAuthor,
    proposalPriceLabel,
    statusLabel,
    summaryText,
    summarySubtext,
    summaryTone,
  };
}

export default function OffersPage() {
  const { user, token, loading: authLoading } = useRequireAuth();
  const [activeTab, setActiveTab] = useState<OfferTab>('received');
  const [offers, setOffers] = useState<OfferSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showCounterModal, setShowCounterModal] = useState<OfferSummary | null>(null);
  const [counterPrice, setCounterPrice] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [counterSubmitting, setCounterSubmitting] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<OfferSummary | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [sellerReplyTarget, setSellerReplyTarget] = useState<OfferSummary | null>(null);
  const [sellerReplyText, setSellerReplyText] = useState('');
  const [sellerReplySubmitting, setSellerReplySubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchOffers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg(null);

    const apiCall = activeTab === 'received' ? getReceivedOffers(token) : getSentOffers(token);
    const result = await apiCall;

    if (result.data) {
      setOffers(result.data.offers);
    } else {
      setErrorMsg(result.error || 'Failed to load offers.');
    }

    setLoading(false);
  }, [token, activeTab]);

  useEffect(() => {
    if (!user || !token) return;

    const timeoutId = window.setTimeout(() => {
      void fetchOffers();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [user, token, fetchOffers]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeoutId = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  const handleAccept = async (offerId: string) => {
    if (!token) return;
    setActionLoadingId(offerId);
    const res = await acceptOffer(token, offerId);
    setActionLoadingId(null);
    if (res.data) {
      setNotice({ type: 'success', message: 'Offer accepted successfully.' });
      fetchOffers();
    } else {
      setNotice({ type: 'error', message: res.error || 'Failed to accept offer' });
    }
  };

  const handleReject = async (offerId: string) => {
    if (!token) return;
    if (!window.confirm('Are you sure you want to reject this proposal?')) return;
    setActionLoadingId(offerId);
    const res = await rejectOffer(token, offerId);
    setActionLoadingId(null);
    if (res.data) {
      setNotice({ type: 'success', message: 'Offer rejected successfully.' });
      fetchOffers();
    } else {
      setNotice({ type: 'error', message: res.error || 'Failed to reject offer' });
    }
  };

  const handleCancel = async (offerId: string) => {
    if (!token) return;
    if (!window.confirm('Are you sure you want to withdraw this pending proposal?')) return;
    setActionLoadingId(offerId);
    const res = await cancelOffer(token, offerId);
    setActionLoadingId(null);
    if (res.data) {
      setNotice({ type: 'success', message: 'Offer cancelled successfully.' });
      fetchOffers();
    } else {
      setNotice({ type: 'error', message: res.error || 'Failed to cancel offer' });
    }
  };

  const openCounterModal = (offer: OfferSummary) => {
    setShowCounterModal(offer);
    setCounterPrice(String(offer.offerPrice));
    setCounterMessage('');
  };

  const openReviewModal = (offer: OfferSummary) => {
    setReviewTarget(offer);
    setReviewRating(5);
    setReviewComment('');
  };

  const openSellerReplyModal = (offer: OfferSummary) => {
    setSellerReplyTarget(offer);
    setSellerReplyText(offer.saleFollowUp?.review?.sellerResponse?.body ?? '');
  };

  const submitCounter = async () => {
    if (!token || !showCounterModal) return;
    setCounterSubmitting(true);

    const res = await counterOffer(token, showCounterModal.id, {
      counterPrice: parseFloat(counterPrice),
      message: counterMessage.trim() || undefined,
    });

    setCounterSubmitting(false);

    if (res.data) {
      setShowCounterModal(null);
      setNotice({ type: 'success', message: 'Counter-offer submitted successfully.' });
      fetchOffers();
    } else {
      setNotice({ type: 'error', message: res.error || 'Failed to submit counter offer' });
    }
  };

  const submitReview = async () => {
    if (!token || !reviewTarget) return;
    if (reviewRating < 1 || reviewRating > 5) {
      setNotice({ type: 'error', message: 'Choose a rating between 1 and 5 stars.' });
      return;
    }

    setReviewSubmitting(true);

    const res = await submitBuyerReview(token, reviewTarget.id, {
      rating: reviewRating,
      comment: reviewComment.trim() || undefined,
    });

    setReviewSubmitting(false);

    if (res.data) {
      setReviewTarget(null);
      setNotice({ type: 'success', message: 'Receipt confirmed and seller review saved.' });
      void fetchOffers();
    } else {
      setNotice({ type: 'error', message: res.error || 'Failed to save your seller review' });
    }
  };

  const submitSellerReply = async () => {
    if (!token || !sellerReplyTarget) return;
    if (sellerReplyText.trim().length < 3) {
      setNotice({ type: 'error', message: 'Your reply should be at least 3 characters long.' });
      return;
    }

    setSellerReplySubmitting(true);

    const res = await submitSellerReviewResponse(token, sellerReplyTarget.id, {
      response: sellerReplyText.trim(),
    });

    setSellerReplySubmitting(false);

    if (res.data) {
      setSellerReplyTarget(null);
      setNotice({ type: 'success', message: 'Seller reply saved successfully.' });
      void fetchOffers();
    } else {
      setNotice({ type: 'error', message: res.error || 'Failed to save your reply' });
    }
  };

  const currentUserId = user?.id ?? null;

  if (authLoading || loading) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Offers</h1>
          <p className={styles.subtitle}>
            Review incoming proposals, respond to counter-offers, and track the offers you have sent.
          </p>
        </div>
        <div className={styles.tabsRow}>
          <button
            className={`${styles.tab} ${activeTab === 'received' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('received')}
          >
            Received
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'sent' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('sent')}
          >
            Sent
          </button>
        </div>
      </header>

      {notice && (
        <div className={notice.type === 'success' ? styles.noticeSuccess : styles.noticeError}>
          {notice.message}
        </div>
      )}

      {errorMsg ? (
        <div className={styles.emptyState}>
          <h3>Something went wrong</h3>
          <p>{errorMsg}</p>
        </div>
      ) : offers.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>No offers found</h3>
          <p>
            {activeTab === 'received'
              ? 'You have not received any offers yet. Make sure your active listings are competitive.'
              : 'You have not sent any offers yet. Explore the marketplace to find something you like.'}
          </p>
        </div>
      ) : (
        <div className={styles.offersList}>
          {offers.map((offer) => {
            const isReceived = activeTab === 'received';
            const participant = isReceived ? offer.buyer : offer.seller;
            const participantRoleLabel = isReceived ? 'Buyer' : 'Seller';
            const messageHref = buildMessageHref(
              offer.listingId,
              participant.id,
              participant.displayName
            );
            const presentation = getOfferPresentation(offer, activeTab, currentUserId);
            const summaryClass =
              presentation.summaryTone === 'action'
                ? styles.offerSummaryAction
                : presentation.summaryTone === 'waiting'
                  ? styles.offerSummaryWaiting
                  : styles.offerSummaryNeutral;
            const statusClass =
              offer.status === 'pending'
                ? styles.statusPending
                : offer.status === 'accepted'
                  ? styles.statusAccepted
                  : offer.status === 'rejected'
                    ? styles.statusRejected
                    : offer.status === 'withdrawn'
                      ? styles.statusWithdrawn
                    : styles.statusCancelled;
            const saleFollowUp = offer.saleFollowUp;
            const isCompletedSale = offer.status === 'accepted' && offer.listing.status === 'sold' && Boolean(saleFollowUp);
            const followUpClass = saleFollowUp?.deliveryIssue
              ? styles.fulfillmentIssue
              : saleFollowUp?.review
                ? styles.fulfillmentReceived
                : styles.fulfillmentPending;
            const deliveryIssueHref = buildDeliveryIssueHref(offer);
            const receipt = saleFollowUp?.receipt ?? null;
            const receiptHref = receipt ? `${ROUTES.PURCHASES}/${receipt.id}` : ROUTES.PURCHASES;
            const receiptStatusClass =
              receipt?.paymentStatus === 'seller_confirmed_paid'
                ? styles.receiptStatusPaid
                : receipt?.paymentStatus === 'buyer_marked_paid'
                  ? styles.receiptStatusWaiting
                  : styles.receiptStatusPending;

            return (
              <div key={offer.id} className={styles.offerCard}>
                <Link href={`/product/${offer.listingId}`} className={styles.listingImageWrap}>
                  {offer.listing.coverImagePath ? (
                    <img
                      src={offer.listing.coverImagePath}
                      alt={offer.listing.title}
                      className={styles.listingImage}
                    />
                  ) : (
                    <div className={styles.listingFallback}>{offer.listing.title.charAt(0)}</div>
                  )}
                </Link>

                <div className={styles.offerDetails}>
                  <div className={styles.offerHeaderRow}>
                    <div>
                      <Link href={`/product/${offer.listingId}`} className={styles.listingTitle}>
                        {offer.listing.title}
                      </Link>
                      <div className={styles.metaInfo}>
                        <span>{formatDate(offer.createdAt)}</span>
                        <span>|</span>
                        <span className={styles.participantName}>
                          {participant.avatarPath ? (
                            <img src={participant.avatarPath} alt="" className={styles.avatar} />
                          ) : (
                            <span className={styles.avatarFallback}>
                              {participant.displayName.charAt(0)}
                            </span>
                          )}
                          {participantRoleLabel}: {participant.displayName}
                        </span>
                        {offer.offerKind === 'counter_offer' && (
                          <span className={styles.kindPill}>Counter Offer</span>
                        )}
                        {offer.offerKind === 'purchase_request' && (
                          <span className={styles.kindPill}>Purchase Req.</span>
                        )}
                      </div>
                    </div>
                    <span className={`${styles.statusBadge} ${statusClass}`}>
                      {presentation.statusLabel}
                    </span>
                  </div>

                  <div className={`${styles.offerSummary} ${summaryClass}`}>
                    <p className={styles.offerSummaryText}>{presentation.summaryText}</p>
                    {presentation.summarySubtext && (
                      <p className={styles.offerSummarySubtext}>{presentation.summarySubtext}</p>
                    )}
                  </div>

                  <div className={styles.priceBlock}>
                    <div className={styles.priceItem}>
                      <span className={styles.priceLabel}>{presentation.proposalPriceLabel}</span>
                      <span className={`${styles.priceValue} ${styles.priceValueHighlight}`}>
                        {formatCurrency(offer.offerPrice, offer.listing.currency)}
                      </span>
                    </div>
                    <div className={styles.priceItem}>
                      <span className={styles.priceLabel}>Asking Price</span>
                      <span className={styles.priceValue}>
                        {formatCurrency(offer.askingPrice, offer.listing.currency)}
                      </span>
                    </div>
                  </div>

                  {offer.message && (
                    <div className={styles.messageBlock}>
                      <span className={styles.messageLabel}>
                        Message from {presentation.messageAuthor}:
                      </span>
                      <p className={styles.messageText}>
                        &ldquo;{offer.message}&rdquo;
                      </p>
                    </div>
                  )}

                  {isCompletedSale && saleFollowUp && (
                    <div className={`${styles.fulfillmentBlock} ${followUpClass}`}>
                      <div className={styles.fulfillmentHeader}>
                        <strong>Post-sale follow-up</strong>
                        <span>
                          {saleFollowUp.review
                            ? formatDateTime(saleFollowUp.review.createdAt)
                            : saleFollowUp.deliveryIssue
                              ? formatDateTime(saleFollowUp.deliveryIssue.createdAt)
                              : 'Buyer confirmation pending'}
                        </span>
                      </div>

                      {saleFollowUp.review ? (
                        <>
                          <p className={styles.fulfillmentText}>
                            {isReceived
                              ? `Buyer confirmed the item was received and rated you ${saleFollowUp.review.rating}/5.`
                              : `You confirmed the item was received and rated ${offer.seller.displayName} ${saleFollowUp.review.rating}/5.`}
                          </p>
                          <div className={styles.ratingRow} aria-label={`Rated ${saleFollowUp.review.rating} out of 5`}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <span
                                key={star}
                                className={`${styles.ratingStar} ${
                                  star <= saleFollowUp.review!.rating ? styles.ratingStarFilled : ''
                                }`}
                              >
                                <StarIcon filled={star <= saleFollowUp.review!.rating} />
                              </span>
                            ))}
                          </div>
                          {saleFollowUp.review.comment && (
                            <p className={styles.fulfillmentQuote}>
                              &ldquo;{saleFollowUp.review.comment}&rdquo;
                            </p>
                          )}
                          {saleFollowUp.review.sellerResponse && (
                            <div className={styles.sellerReplyBlock}>
                              <div className={styles.sellerReplyHeader}>
                                <strong>Seller reply</strong>
                                <span>{formatDateTime(saleFollowUp.review.sellerResponse.updatedAt)}</span>
                              </div>
                              <p className={styles.sellerReplyText}>
                                &ldquo;{saleFollowUp.review.sellerResponse.body}&rdquo;
                              </p>
                            </div>
                          )}
                        </>
                      ) : saleFollowUp.deliveryIssue ? (
                        <>
                          <p className={styles.fulfillmentText}>
                            {isReceived
                              ? `Buyer reported that the item was not received. Admin status: ${saleFollowUp.deliveryIssue.statusLabel}.`
                              : `You reported that the item was not received. Admin status: ${saleFollowUp.deliveryIssue.statusLabel}.`}
                          </p>
                          <div className={styles.fulfillmentMeta}>
                            {saleFollowUp.deliveryIssue.agreedPriceLabel && (
                              <span>Agreed price: {saleFollowUp.deliveryIssue.agreedPriceLabel}</span>
                            )}
                            {saleFollowUp.deliveryIssue.paymentReference && (
                              <span>Payment ref: {saleFollowUp.deliveryIssue.paymentReference}</span>
                            )}
                            <span>{saleFollowUp.deliveryIssue.proofUrls.length} proof file(s)</span>
                          </div>
                          <p className={styles.fulfillmentQuote}>
                            &ldquo;{saleFollowUp.deliveryIssue.buyerStatement}&rdquo;
                          </p>
                        </>
                      ) : (
                        <p className={styles.fulfillmentText}>
                          {isReceived
                            ? 'The listing is marked as sold. Waiting for the buyer to confirm receipt or raise a delivery issue.'
                            : 'Your price was accepted. Confirm receipt once the item arrives, or report it to admin if the seller never delivers it.'}
                        </p>
                      )}

                      {receipt && (
                        <div className={styles.receiptBlock}>
                          <div className={styles.receiptHeader}>
                            <strong>Receipt {receipt.receiptNumber}</strong>
                            <span className={`${styles.receiptStatus} ${receiptStatusClass}`}>
                              {receipt.paymentStatusLabel}
                            </span>
                          </div>
                          <div className={styles.receiptMeta}>
                            <span>
                              Total: {formatCurrency(receipt.totalAmount, receipt.currency)}
                            </span>
                            {receipt.buyerMarkedPaidAt && (
                              <span>Buyer marked paid: {formatDateTime(receipt.buyerMarkedPaidAt)}</span>
                            )}
                            {receipt.sellerConfirmedPaidAt && (
                              <span>
                                Seller confirmed: {formatDateTime(receipt.sellerConfirmedPaidAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={styles.actions}>
                    {offer.status === 'pending' && presentation.isWaitingForCurrentUser && isReceived && (
                      <>
                        <button
                          className={`${styles.btn} ${styles.btnAccept}`}
                          onClick={() => handleAccept(offer.id)}
                          disabled={!!actionLoadingId}
                        >
                          {actionLoadingId === offer.id
                            ? 'Working...'
                            : offer.offerKind === 'purchase_request'
                              ? 'Accept Request'
                              : 'Accept Offer'}
                        </button>
                        <button
                          className={`${styles.btn} ${styles.btnPrimary}`}
                          onClick={() => openCounterModal(offer)}
                          disabled={!!actionLoadingId}
                        >
                          {offer.offerKind === 'counter_offer' ? 'Counter Again' : 'Counter Offer'}
                        </button>
                        <button
                          className={`${styles.btn} ${styles.btnDanger}`}
                          onClick={() => handleReject(offer.id)}
                          disabled={!!actionLoadingId}
                        >
                          {actionLoadingId === offer.id
                            ? 'Working...'
                            : offer.offerKind === 'purchase_request'
                              ? 'Reject Request'
                              : 'Reject Offer'}
                        </button>
                        <Link
                          href={messageHref}
                          className={`${styles.btn} ${styles.btnSecondary}`}
                        >
                          Message Buyer
                        </Link>
                      </>
                    )}

                    {offer.status === 'pending' && presentation.isWaitingForCurrentUser && !isReceived && (
                      <>
                        <button
                          className={`${styles.btn} ${styles.btnAccept}`}
                          onClick={() => handleAccept(offer.id)}
                          disabled={!!actionLoadingId}
                        >
                          {actionLoadingId === offer.id ? 'Working...' : 'Accept Counter-Offer'}
                        </button>
                        <button
                          className={`${styles.btn} ${styles.btnPrimary}`}
                          onClick={() => openCounterModal(offer)}
                          disabled={!!actionLoadingId}
                        >
                          Send Another Offer
                        </button>
                        <button
                          className={`${styles.btn} ${styles.btnDanger}`}
                          onClick={() => handleReject(offer.id)}
                          disabled={!!actionLoadingId}
                        >
                          {actionLoadingId === offer.id ? 'Working...' : 'Reject Counter-Offer'}
                        </button>
                        <Link
                          href={messageHref}
                          className={`${styles.btn} ${styles.btnSecondary}`}
                        >
                          Message Seller
                        </Link>
                      </>
                    )}

                    {offer.status === 'pending' && presentation.isInitiatedByCurrentUser && (
                      <>
                        <button
                          className={`${styles.btn} ${styles.btnDanger}`}
                          onClick={() => handleCancel(offer.id)}
                          disabled={!!actionLoadingId}
                        >
                          {actionLoadingId === offer.id
                            ? 'Cancelling...'
                            : offer.offerKind === 'counter_offer'
                              ? 'Withdraw Counter-Offer'
                              : offer.offerKind === 'purchase_request'
                                ? 'Cancel Request'
                                : 'Cancel Offer'}
                        </button>
                        <Link
                          href={messageHref}
                          className={`${styles.btn} ${styles.btnSecondary}`}
                        >
                          {isReceived ? 'Message Buyer' : 'Message Seller'}
                        </Link>
                      </>
                    )}

                    {isCompletedSale && saleFollowUp && (
                      <>
                        {saleFollowUp.canBuyerConfirmReceived && (
                          <button
                            className={`${styles.btn} ${styles.btnAccept}`}
                            onClick={() => openReviewModal(offer)}
                            disabled={reviewSubmitting}
                          >
                            Item Received
                          </button>
                        )}

                        {saleFollowUp.canBuyerReportNotReceived && (
                          <Link href={deliveryIssueHref} className={`${styles.btn} ${styles.btnDanger}`}>
                            Item Not Received
                          </Link>
                        )}

                        <Link href={messageHref} className={`${styles.btn} ${styles.btnSecondary}`}>
                          {isReceived ? 'Message Buyer' : 'Message Seller'}
                        </Link>
                        {receipt && (
                          <Link href={receiptHref} className={`${styles.btn} ${styles.btnPrimary}`}>
                            View Receipt
                          </Link>
                        )}
                      </>
                    )}

                    {isCompletedSale && saleFollowUp?.review && isReceived && (
                      <button
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        onClick={() => openSellerReplyModal(offer)}
                        disabled={sellerReplySubmitting}
                      >
                        {saleFollowUp.review.sellerResponse ? 'Edit Review Reply' : 'Reply to Review'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCounterModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCounterModal(null)}>
          <div className={styles.modalContent} onClick={(event) => event.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => setShowCounterModal(null)}>
              x
            </button>
            <h2 className={styles.modalTitle}>
              {activeTab === 'sent' ? 'Send Another Offer' : 'Counter Offer'}
            </h2>
            <p className={styles.modalSubtitle}>
              {activeTab === 'sent'
                ? `Respond to ${showCounterModal.seller.displayName}'s counter-offer of ${formatCurrency(showCounterModal.offerPrice, showCounterModal.listing.currency)} with the price you want to propose next.`
                : `Respond to ${showCounterModal.buyer.displayName}'s current price of ${formatCurrency(showCounterModal.offerPrice, showCounterModal.listing.currency)}.`}
            </p>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                {activeTab === 'sent' ? 'Your New Offer Price' : 'Your Counter Price'}
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.inputPrefix}>{showCounterModal.listing.currency}</span>
                <input
                  type="number"
                  className={styles.inputField}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  value={counterPrice}
                  onChange={(event) => setCounterPrice(event.target.value)}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                {activeTab === 'sent' ? 'Message to Seller (Optional)' : 'Counter Message (Optional)'}
              </label>
              <textarea
                className={styles.textareaField}
                placeholder={
                  activeTab === 'sent'
                    ? 'E.g., I can do this price if we meet today.'
                    : 'E.g., I can do this price if you pick it up today.'
                }
                value={counterMessage}
                onChange={(event) => setCounterMessage(event.target.value)}
              />
            </div>

            <div className={styles.modalActions}>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => setShowCounterModal(null)}
              >
                Cancel
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={submitCounter}
                disabled={counterSubmitting || !counterPrice || parseFloat(counterPrice) <= 0}
              >
                {counterSubmitting
                  ? 'Sending...'
                  : activeTab === 'sent'
                    ? 'Send Another Offer'
                    : 'Send Counter Offer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewTarget && (
        <div className={styles.modalOverlay} onClick={() => setReviewTarget(null)}>
          <div className={styles.modalContent} onClick={(event) => event.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => setReviewTarget(null)}>
              x
            </button>
            <h2 className={styles.modalTitle}>Confirm Receipt</h2>
            <p className={styles.modalSubtitle}>
              Let the marketplace know the item arrived, then rate your experience with {reviewTarget.seller.displayName}.
            </p>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Seller Rating</label>
              <div className={styles.ratingPicker}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    className={`${styles.ratingButton} ${
                      star <= reviewRating ? styles.ratingButtonActive : ''
                    }`}
                    onClick={() => setReviewRating(star)}
                    aria-label={`Rate ${star} star${star === 1 ? '' : 's'}`}
                  >
                    <StarIcon filled={star <= reviewRating} />
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Comment (Optional)</label>
              <textarea
                className={styles.textareaField}
                placeholder="Describe the seller, item condition, or overall experience."
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                maxLength={1000}
              />
            </div>

            <div className={styles.modalActions}>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => setReviewTarget(null)}
              >
                Cancel
              </button>
              <button
                className={`${styles.btn} ${styles.btnAccept}`}
                onClick={submitReview}
                disabled={reviewSubmitting}
              >
                {reviewSubmitting ? 'Saving...' : 'Submit Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {sellerReplyTarget && (
        <div className={styles.modalOverlay} onClick={() => setSellerReplyTarget(null)}>
          <div className={styles.modalContent} onClick={(event) => event.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => setSellerReplyTarget(null)}>
              x
            </button>
            <h2 className={styles.modalTitle}>Reply to Buyer Review</h2>
            <p className={styles.modalSubtitle}>
              Add context for {sellerReplyTarget.buyer.displayName} on the completed sale of{' '}
              {sellerReplyTarget.listing.title}.
            </p>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Seller Reply</label>
              <textarea
                className={styles.textareaField}
                placeholder="Thank the buyer or add helpful context about the transaction."
                value={sellerReplyText}
                onChange={(event) => setSellerReplyText(event.target.value)}
                maxLength={1000}
              />
            </div>

            <div className={styles.modalActions}>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => setSellerReplyTarget(null)}
              >
                Cancel
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={submitSellerReply}
                disabled={sellerReplySubmitting}
              >
                {sellerReplySubmitting ? 'Saving...' : 'Save Reply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

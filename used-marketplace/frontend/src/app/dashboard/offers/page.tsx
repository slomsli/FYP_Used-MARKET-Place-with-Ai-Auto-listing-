'use client';

import { useEffect, useState, useCallback, Fragment } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import {
  getReceivedOffers,
  getSentOffers,
  acceptOffer,
  rejectOffer,
  cancelOffer,
  counterOffer,
  type OfferSummary,
} from '@/src/services/offerService';
import { ROUTES } from '@/src/config/routes';
import styles from './offers.module.css';

function formatCurrency(amount: number, currency = 'MYR') {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
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

export default function OffersPage() {
  const { user, token, loading: authLoading } = useRequireAuth();
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');
  
  const [offers, setOffers] = useState<OfferSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // State for Counter Offer Modal
  const [showCounterModal, setShowCounterModal] = useState<OfferSummary | null>(null);
  const [counterPrice, setCounterPrice] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [counterSubmitting, setCounterSubmitting] = useState(false);

  // State for action loading to disabled buttons
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
    if (user && token) {
      fetchOffers();
    }
  }, [user, token, fetchOffers]);

  // Actions
  const handleAccept = async (offerId: string) => {
    if (!token) return;
    setActionLoadingId(offerId);
    const res = await acceptOffer(token, offerId);
    setActionLoadingId(null);
    if (res.data) fetchOffers();
    else alert(res.error || 'Failed to accept offer');
  };

  const handleReject = async (offerId: string) => {
    if (!token) return;
    if (!window.confirm('Are you sure you want to reject this offer?')) return;
    setActionLoadingId(offerId);
    const res = await rejectOffer(token, offerId);
    setActionLoadingId(null);
    if (res.data) fetchOffers();
    else alert(res.error || 'Failed to reject offer');
  };

  const handleCancel = async (offerId: string) => {
    if (!token) return;
    if (!window.confirm('Are you sure you want to cancel your offer?')) return;
    setActionLoadingId(offerId);
    const res = await cancelOffer(token, offerId);
    setActionLoadingId(null);
    if (res.data) fetchOffers();
    else alert(res.error || 'Failed to cancel offer');
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
      fetchOffers();
    } else {
      alert(res.error || 'Failed to submit counter offer');
    }
  };

  if (authLoading || (!offers && loading)) {
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
          <p className={styles.subtitle}>Review your received offers and track the ones you've sent.</p>
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

      {errorMsg ? (
        <div className={styles.emptyState}>
          <h3>Something went wrong</h3>
          <p>{errorMsg}</p>
        </div>
      ) : loading ? (
        <div className={styles.emptyState}>
          <p>Refreshing...</p>
        </div>
      ) : offers.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>No offers found</h3>
          <p>
            {activeTab === 'received'
              ? 'You haven\'t received any offers yet. Make sure your active listings are competitive.'
              : 'You haven\'t sent any offers yet. Explore the marketplace to find something you like.'}
          </p>
        </div>
      ) : (
        <div className={styles.offersList}>
          {offers.map((offer) => {
            const isReceived = activeTab === 'received';
            const participant = isReceived ? offer.buyer : offer.seller;
            const statusClass = 
              offer.status === 'pending' ? styles.statusPending : 
              offer.status === 'accepted' ? styles.statusAccepted : 
              offer.status === 'rejected' ? styles.statusRejected : styles.statusCancelled;

            return (
              <div key={offer.id} className={styles.offerCard}>
                <Link href={`/product/${offer.listingId}`} className={styles.listingImageWrap}>
                  {offer.listing.coverImagePath ? (
                    <img src={offer.listing.coverImagePath} alt={offer.listing.title} className={styles.listingImage} />
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
                        <span>•</span>
                        <span className={styles.participantName}>
                          {participant.avatarPath ? (
                            <img src={participant.avatarPath} alt="" className={styles.avatar} />
                          ) : (
                            <span className={styles.avatarFallback}>{participant.displayName.charAt(0)}</span>
                          )}
                          {isReceived ? 'Buyer:' : 'Seller:'} {participant.displayName}
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
                      {offer.status}
                    </span>
                  </div>

                  <div className={styles.priceBlock}>
                    <div className={styles.priceItem}>
                      <span className={styles.priceLabel}>Your Price</span>
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
                      <span className={styles.messageLabel}>Message from {participant.displayName}:</span>
                      <p className={styles.messageText}>"{offer.message}"</p>
                    </div>
                  )}

                  <div className={styles.actions}>
                    {offer.status === 'pending' && isReceived && (
                      <>
                        <button
                          className={`${styles.btn} ${styles.btnAccept}`}
                          onClick={() => handleAccept(offer.id)}
                          disabled={!!actionLoadingId}
                        >
                          {actionLoadingId === offer.id ? 'Working...' : 'Accept'}
                        </button>
                        <button
                          className={`${styles.btn} ${styles.btnPrimary}`}
                          onClick={() => {
                            setShowCounterModal(offer);
                            setCounterPrice('');
                            setCounterMessage('');
                          }}
                          disabled={!!actionLoadingId}
                        >
                          Counter Offer
                        </button>
                        <button
                          className={`${styles.btn} ${styles.btnDanger}`}
                          onClick={() => handleReject(offer.id)}
                          disabled={!!actionLoadingId}
                        >
                          Reject
                        </button>
                        <Link
                          href={`${ROUTES.MESSAGES}?listingId=${offer.listingId}&sellerId=${offer.buyerId}`}
                          className={`${styles.btn} ${styles.btnSecondary}`}
                        >
                          Message
                        </Link>
                      </>
                    )}
                    {offer.status === 'pending' && !isReceived && (
                      <>
                        <button
                          className={`${styles.btn} ${styles.btnDanger}`}
                          onClick={() => handleCancel(offer.id)}
                          disabled={!!actionLoadingId}
                        >
                          {actionLoadingId === offer.id ? 'Cancelling...' : 'Cancel Offer'}
                        </button>
                        <Link
                          href={`${ROUTES.MESSAGES}?listingId=${offer.listingId}&sellerId=${offer.sellerId}`}
                          className={`${styles.btn} ${styles.btnSecondary}`}
                        >
                          Message Seller
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Counter Offer Modal */}
      {showCounterModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCounterModal(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => setShowCounterModal(null)}>✕</button>
            <h2 className={styles.modalTitle}>Counter Offer</h2>
            <p className={styles.modalSubtitle}>
              Respond to {showCounterModal.buyer.displayName}'s offer of {formatCurrency(showCounterModal.offerPrice, showCounterModal.listing.currency)}.
            </p>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Your Counter Price</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputPrefix}>{showCounterModal.listing.currency}</span>
                <input
                  type="number"
                  className={styles.inputField}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  value={counterPrice}
                  onChange={(e) => setCounterPrice(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Counter Message (Optional)</label>
              <textarea
                className={styles.textareaField}
                placeholder="E.g., I can do this price if you pick it up today."
                value={counterMessage}
                onChange={(e) => setCounterMessage(e.target.value)}
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
                {counterSubmitting ? 'Sending...' : 'Send Counter Offer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

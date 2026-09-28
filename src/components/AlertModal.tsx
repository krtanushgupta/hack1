import React, { useState, useEffect } from 'react';
import { X, Bell, TrendingDown, Clock } from 'lucide-react';
import {
  type PlatformEntry,
  type TrackedAlert,
  parseNumericPrice,
  parseNumericMinutes,
} from '../types/comparison';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: string;
  city: string;
  platforms: PlatformEntry[];
  initialType: 'price_drop' | 'delivery_alert';
  initialPlatform?: string;
  onSaveAlert: (alert: Omit<TrackedAlert, 'id' | 'createdAt'>) => void;
}

export const AlertModal: React.FC<AlertModalProps> = ({
  isOpen,
  onClose,
  product,
  city,
  platforms,
  initialType,
  initialPlatform,
  onSaveAlert,
}) => {
  const [alertType, setAlertType] = useState<'price_drop' | 'delivery_alert'>(initialType);
  const [selectedPlatform, setSelectedPlatform] = useState<string>(
    initialPlatform || 'Any Platform'
  );
  const [targetValue, setTargetValue] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    setAlertType(initialType);
    const plat = initialPlatform || 'Any Platform';
    setSelectedPlatform(plat);

    const matchingEntry = platforms.find((p) => p.name === initialPlatform) || platforms[0];
    if (initialType === 'price_drop') {
      const currentNum = parseNumericPrice(matchingEntry?.price);
      const suggested = currentNum < 999999 ? Math.max(1, Math.round(currentNum * 0.92)) : 50;
      setTargetValue(`₹${suggested}`);
    } else {
      const currentMin = parseNumericMinutes(matchingEntry?.delivery_time);
      const suggestedMin = currentMin < 999 ? Math.max(5, currentMin - 2) : 10;
      setTargetValue(`${suggestedMin} min`);
    }
  }, [isOpen, initialType, initialPlatform, platforms]);

  if (!isOpen) return null;

  const matchingEntry =
    platforms.find((p) => p.name === selectedPlatform) || platforms[0];

  const currentMetric =
    alertType === 'price_drop'
      ? matchingEntry?.price || '₹-- (Unavailable)'
      : matchingEntry?.delivery_time || '-- min (Unavailable)';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetValue.trim()) return;

    const formattedTarget =
      alertType === 'price_drop'
        ? targetValue.trim().startsWith('₹')
          ? targetValue.trim()
          : `₹${targetValue.trim()}`
        : targetValue.trim().toLowerCase().includes('min')
        ? targetValue.trim()
        : `${targetValue.trim()} min`;

    onSaveAlert({
      product,
      platform: selectedPlatform,
      type: alertType,
      targetValue: formattedTarget,
      currentValue: currentMetric,
      city,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alert-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 id="alert-modal-title" className="text-lg font-bold text-slate-900">
              Configure Quick-Commerce Alert
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {product} · {city}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Engagement Hook Type
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setAlertType('price_drop');
                  const num = parseNumericPrice(matchingEntry?.price);
                  setTargetValue(`₹${num < 999999 ? Math.max(1, Math.round(num * 0.92)) : 50}`);
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  alertType === 'price_drop'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TrendingDown className="w-3.5 h-3.5" />
                Track Price Drop
              </button>
              <button
                type="button"
                onClick={() => {
                  setAlertType('delivery_alert');
                  const mins = parseNumericMinutes(matchingEntry?.delivery_time);
                  setTargetValue(`${mins < 999 ? Math.max(5, mins - 2) : 10} min`);
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  alertType === 'delivery_alert'
                    ? 'bg-white text-sky-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Set Delivery Alert
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="platform-select" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Target Platform
            </label>
            <select
              id="platform-select"
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="Any Platform">Any Platform (Blinkit, Flipkart, Amazon, Zepto)</option>
              {platforms.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} (Current: {alertType === 'price_drop' ? p.price || '₹--' : p.delivery_time || '--'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="threshold-input" className="text-xs font-semibold text-slate-700">
                {alertType === 'price_drop' ? 'Target Price Threshold' : 'Maximum Delivery Time'}
              </label>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                Current: {currentMetric}
              </span>
            </div>
            <input
              id="threshold-input"
              type="text"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder={alertType === 'price_drop' ? 'e.g. ₹48' : 'e.g. 10 min'}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg transition-colors whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <Bell className="w-3.5 h-3.5" />
              Save Active Alert
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

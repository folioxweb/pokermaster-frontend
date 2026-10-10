import React from 'react';

export const BadgeAsset = ({ type = 'dealer', className = '' }) => {
  let badgeId = 'badge-dealer';

  if (type === 'sb') badgeId = 'badge-sb';
  if (type === 'bb') badgeId = 'badge-bb';
  if (type === 'allin') badgeId = 'badge-allin';

  return (
    <div className={`badge-wrapper inline-flex items-center justify-center drop-shadow-md select-none ${className}`}>
      <svg className="w-5 h-5" viewBox="0 0 40 40">
        <use href={`/assets/chips/chips-sprite.svg#${badgeId}`} />
      </svg>
    </div>
  );
};

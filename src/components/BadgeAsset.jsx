import React from 'react';

export const BadgeAsset = ({ type = 'dealer', className = '' }) => {
  let badgeId = 'badge-dealer';

  if (type === 'sb') badgeId = 'badge-sb';
  if (type === 'bb') badgeId = 'badge-bb';
  if (type === 'allin') badgeId = 'badge-allin';

  return (
    <div
      className={`badge-wrapper select-none ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '20px',
        height: '20px',
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))'
      }}
    >
      <svg style={{ width: '100%', height: '100%', display: 'block' }} viewBox="0 0 40 40">
        <use href={`/assets/chips/chips-sprite.svg#${badgeId}`} />
      </svg>
    </div>
  );
};

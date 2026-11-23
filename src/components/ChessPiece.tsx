import React from 'react';
import type { Color, PieceSymbol } from 'chess.js';
import type { PieceStyleId } from '../types/settings';

interface ChessPieceProps {
  type: PieceSymbol;
  color: Color;
  pieceStyle?: PieceStyleId;
  className?: string;
}

export const ChessPiece: React.FC<ChessPieceProps> = ({
  type,
  color,
  pieceStyle = 'staunton',
  className = 'w-full h-full',
}) => {
  const isWhite = color === 'w';
  const fill = isWhite ? '#FFFFFF' : '#111827';
  const stroke = isWhite ? '#1E293B' : '#020617';
  const detailStroke = isWhite ? '#334155' : '#94A3B8';
  const baseFill = isWhite ? '#E2E8F0' : '#1E293B';

  if (pieceStyle === 'modern') {
    const flatFill = isWhite ? '#F8FAFC' : '#1E293B';
    const flatStroke = isWhite ? '#334155' : '#090D16';
    const accent = isWhite ? '#CBD5E1' : '#475569';

    switch (type) {
      case 'p':
        return (
          <svg viewBox="0 0 45 45" className={`${className} drop-shadow-[0_2px_3px_rgba(0,0,0,0.28)]`} aria-hidden="true">
            <circle cx="22.5" cy="14" r="5.5" fill={flatFill} stroke={flatStroke} strokeWidth="1.7" />
            <path
              d="M17.5 22h10l3.5 14H14l3.5-14z"
              fill={flatFill}
              stroke={flatStroke}
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <rect x="11.5" y="36" width="22" height="3.5" rx="1.75" fill={accent} stroke={flatStroke} strokeWidth="1.5" />
          </svg>
        );

      case 'r':
        return (
          <svg viewBox="0 0 45 45" className={`${className} drop-shadow-[0_2px_3px_rgba(0,0,0,0.28)]`} aria-hidden="true">
            <path
              d="M12 10h5v4h3.5v-4h4v4H28v-4h5v8l-3 3v14H15V21l-3-3v-8z"
              fill={flatFill}
              stroke={flatStroke}
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <rect x="11" y="35" width="23" height="4" rx="1.75" fill={accent} stroke={flatStroke} strokeWidth="1.5" />
          </svg>
        );

      case 'n':
        return (
          <svg viewBox="0 0 45 45" className={`${className} drop-shadow-[0_2px_3px_rgba(0,0,0,0.28)]`} aria-hidden="true">
            <path
              d="M15 35l2.5-11.5-5.5 2.5-2-4.5 9.5-11 2-3.5 3.5 3c7 1.5 11.5 8 11 25H15z"
              fill={flatFill}
              stroke={flatStroke}
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <circle cx="19" cy="16" r="1.4" fill={isWhite ? '#1E293B' : '#E2E8F0'} />
            <rect x="11" y="35" width="25" height="4" rx="1.75" fill={accent} stroke={flatStroke} strokeWidth="1.5" />
          </svg>
        );

      case 'b':
        return (
          <svg viewBox="0 0 45 45" className={`${className} drop-shadow-[0_2px_3px_rgba(0,0,0,0.28)]`} aria-hidden="true">
            <circle cx="22.5" cy="7.5" r="2.3" fill={accent} stroke={flatStroke} strokeWidth="1.5" />
            <path
              d="M22.5 11c-6.5 4.5-8.5 12-5 19l-2.5 5h15l-2.5-5c3.5-7 1.5-14.5-5-19z"
              fill={flatFill}
              stroke={flatStroke}
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <path d="M19 20l7 7" stroke={isWhite ? '#475569' : '#94A3B8'} strokeWidth="1.8" strokeLinecap="round" />
            <rect x="11.5" y="35" width="22" height="4" rx="1.75" fill={accent} stroke={flatStroke} strokeWidth="1.5" />
          </svg>
        );

      case 'q':
        return (
          <svg viewBox="0 0 45 45" className={`${className} drop-shadow-[0_2px_3px_rgba(0,0,0,0.28)]`} aria-hidden="true">
            <path
              d="M8.5 14l6 10 4-13 4 12 4-12 4 13 6-10-3.5 21H12L8.5 14z"
              fill={flatFill}
              stroke={flatStroke}
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <circle cx="8" cy="12" r="2" fill={accent} stroke={flatStroke} strokeWidth="1.3" />
            <circle cx="18.5" cy="9" r="2" fill={accent} stroke={flatStroke} strokeWidth="1.3" />
            <circle cx="26.5" cy="9" r="2" fill={accent} stroke={flatStroke} strokeWidth="1.3" />
            <circle cx="37" cy="12" r="2" fill={accent} stroke={flatStroke} strokeWidth="1.3" />
            <rect x="11" y="35" width="23" height="4" rx="1.75" fill={accent} stroke={flatStroke} strokeWidth="1.5" />
          </svg>
        );

      case 'k':
        return (
          <svg viewBox="0 0 45 45" className={`${className} drop-shadow-[0_2px_3px_rgba(0,0,0,0.28)]`} aria-hidden="true">
            <path d="M22.5 6v8M18.5 9.5h8" stroke={isWhite ? '#1E293B' : '#CBD5E1'} strokeWidth="2.2" strokeLinecap="round" />
            <path
              d="M12.5 18.5c0-3 3.5-5 10-5s10 2 10 5l-3.5 16.5H16l-3.5-16.5z"
              fill={flatFill}
              stroke={flatStroke}
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <rect x="11.5" y="35" width="22" height="4" rx="1.75" fill={accent} stroke={flatStroke} strokeWidth="1.5" />
          </svg>
        );
    }
  }

  switch (type) {
    case 'p':
      return (
        <svg viewBox="0 0 45 45" className={`${className} drop-shadow-[0_2px_3px_rgba(0,0,0,0.32)]`} aria-hidden="true">
          <path
            d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.55"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {!isWhite && (
            <path
              d="M14.5 36.5h16"
              stroke={detailStroke}
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity="0.6"
            />
          )}
        </svg>
      );

    case 'r':
      return (
        <svg viewBox="0 0 45 45" className={`${className} drop-shadow-[0_2px_3px_rgba(0,0,0,0.32)]`} aria-hidden="true">
          <g
            fill={fill}
            stroke={stroke}
            strokeWidth="1.55"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" />
            <path d="M34 14l-3 3H14l-3-3" />
            <path d="M31 17v12.5H14V17" />
            <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" />
            <path d="M11 14h23" fill="none" />
          </g>
          {!isWhite && (
            <g stroke={detailStroke} strokeWidth="1.15" strokeLinecap="round" opacity="0.65">
              <path d="M14 17h17" />
              <path d="M14 29.5h17" />
              <path d="M12.5 32.5h20" />
            </g>
          )}
        </svg>
      );

    case 'n':
      return (
        <svg viewBox="0 0 45 45" className={`${className} drop-shadow-[0_2px_3px_rgba(0,0,0,0.32)]`} aria-hidden="true">
          <g
            fill={fill}
            stroke={stroke}
            strokeWidth="1.55"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
            <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" />
          </g>
          <circle
            cx="15"
            cy="15.5"
            r="1.1"
            fill={isWhite ? '#1E293B' : '#E2E8F0'}
          />
          {!isWhite && (
            <path
              d="M24.5 12c5.5 1.8 9.2 7.2 9.8 21.5"
              fill="none"
              stroke={detailStroke}
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity="0.55"
            />
          )}
        </svg>
      );

    case 'b':
      return (
        <svg viewBox="0 0 45 45" className={`${className} drop-shadow-[0_2px_3px_rgba(0,0,0,0.32)]`} aria-hidden="true">
          <g
            fill={fill}
            stroke={stroke}
            strokeWidth="1.55"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z" />
            <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
            <circle cx="22.5" cy="8" r="2.5" />
          </g>
          <path
            d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5"
            fill="none"
            stroke={detailStroke}
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      );

    case 'q':
      return (
        <svg viewBox="0 0 45 45" className={`${className} drop-shadow-[0_2px_3px_rgba(0,0,0,0.32)]`} aria-hidden="true">
          <g
            fill={fill}
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="6" cy="12" r="2.5" />
            <circle cx="14" cy="9" r="2.5" />
            <circle cx="22.5" cy="8" r="2.5" />
            <circle cx="31" cy="9" r="2.5" />
            <circle cx="39" cy="12" r="2.5" />
            <path d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z" />
            <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" />
          </g>
          <path
            d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0"
            fill="none"
            stroke={detailStroke}
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity={isWhite ? 0.85 : 0.75}
          />
        </svg>
      );

    case 'k':
      return (
        <svg viewBox="0 0 45 45" className={`${className} drop-shadow-[0_2px_3px_rgba(0,0,0,0.32)]`} aria-hidden="true">
          <g
            fill="none"
            stroke={stroke}
            strokeWidth="1.55"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22.5 11.63V6M20 8h5" stroke={isWhite ? stroke : '#CBD5E1'} />
            <path
              d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"
              fill={fill}
            />
            <path
              d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z"
              fill={fill}
            />
          </g>
          <g fill="none" stroke={detailStroke} strokeWidth="1.2" strokeLinecap="round">
            <path d="M11.5 30c5.5-3 15.5-3 21 0" />
            <path d="M11.5 33.5c5.5-3 15.5-3 21 0" />
            <path d="M11.5 37c5.5-3 15.5-3 21 0" fill={baseFill} opacity="0.25" />
          </g>
        </svg>
      );
  }
};

"use client";

import { useCurrentUserImage } from "~/lib/hooks/use-current-user-image";
import { useCurrentUserName } from "~/lib/hooks/use-current-user-name";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { useSubscription } from "~/lib/hooks/use-subscription";
import React from "react";

export const CurrentUserAvatar = () => {
  const profileImage = useCurrentUserImage();
  const name = useCurrentUserName();
  const { hasActiveSubscription } = useSubscription();
  const initials = name
    ?.split(" ")
    ?.map((word) => word[0])
    ?.join("")
    ?.toUpperCase();

  // 添加日志，排查会员头像未刷新的原因
  console.log(
    "[CurrentUserAvatar] hasActiveSubscription:",
    hasActiveSubscription,
    "profileImage:",
    profileImage,
    "name:",
    name
  );

  // 添加流光动画样式
  const glowClass = hasActiveSubscription
    ? "ring-4 ring-yellow-400 w-12 h-12 md:w-16 md:h-16 animate-glow"
    : "w-12 h-12 md:w-16 md:h-16";

  return (
    <div className="relative inline-block">
      <style jsx>{`
        @keyframes glow {
          0% {
            box-shadow: 0 0 8px 2px #ffe066, 0 0 0 0 #fff0;
            border-color: #ffe066;
          }
          50% {
            box-shadow: 0 0 24px 8px #ffd700, 0 0 0 4px #fff7;
            border-color: #ffd700;
          }
          100% {
            box-shadow: 0 0 8px 2px #ffe066, 0 0 0 0 #fff0;
            border-color: #ffe066;
          }
        }
        .animate-glow {
          animation: glow 2s linear infinite;
        }
      `}</style>
      <Avatar className={glowClass}>
        {profileImage && <AvatarImage alt={initials} src={profileImage} />}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      {hasActiveSubscription && (
        <span
          className="absolute -top-3 left-1/2 -translate-x-1/2 z-10"
          aria-label="订阅皇冠"
        >
          {/* 简单皇冠SVG，可替换为更精美的图标 */}
          <svg
            width="28"
            height="20"
            viewBox="0 0 28 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M2 16L6.5 6L14 14L21.5 6L26 16"
              stroke="#FFD700"
              strokeWidth="2"
              fill="#FFD700"
            />
            <circle
              cx="6.5"
              cy="6"
              r="2"
              fill="#FFD700"
              stroke="#E5B800"
              strokeWidth="1"
            />
            <circle
              cx="21.5"
              cy="6"
              r="2"
              fill="#FFD700"
              stroke="#E5B800"
              strokeWidth="1"
            />
            <circle
              cx="14"
              cy="14"
              r="2"
              fill="#FFD700"
              stroke="#E5B800"
              strokeWidth="1"
            />
          </svg>
        </span>
      )}
    </div>
  );
};

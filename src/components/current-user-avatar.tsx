'use client'

import { useCurrentUserImage } from '~/lib/hooks/use-current-user-image'
import { useCurrentUserName } from '~/lib/hooks/use-current-user-name'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'

export const CurrentUserAvatar = () => {
  const profileImage = useCurrentUserImage()
  const name = useCurrentUserName()
  const initials = name
    ?.split(' ')
    ?.map((word) => word[0])
    ?.join('')
    ?.toUpperCase()

  return (
    <Avatar>
      {profileImage && <AvatarImage alt={initials} src={profileImage} />}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  )
}

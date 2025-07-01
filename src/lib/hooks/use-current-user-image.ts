import { useEffect, useState } from 'react'

import { createClient } from '~/lib/supabase/client'

export const useCurrentUserImage = () => {
  const [image, setImage] = useState<null | string>(null)

  useEffect(() => {
    const fetchUserImage = async () => {
      const { data, error } = await createClient().auth.getUser()
      if (error) {
        console.error(error)
      }

      setImage(data.user?.user_metadata.avatar_url ?? null)
    }
    fetchUserImage()
  }, [])

  return image
}

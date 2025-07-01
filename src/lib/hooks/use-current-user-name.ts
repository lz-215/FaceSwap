import { useEffect, useState } from 'react'

import { createClient } from '~/lib/supabase/client'

export const useCurrentUserName = () => {
  const [name, setName] = useState<null | string>(null)

  useEffect(() => {
    const fetchProfileName = async () => {
      const { data, error } = await createClient().auth.getUser()
      if (error) {
        console.error(error)
      }

      setName(data.user?.user_metadata.full_name ?? '?')
    }

    fetchProfileName()
  }, [])

  return name || '?'
}

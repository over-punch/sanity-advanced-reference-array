import { useClient } from 'sanity'

/**
 * Custom hook to get Sanity client instance
 * @returns Sanity client configured with API version
 */
export const useSanityClient = () => {
  return useClient({ apiVersion: '2023-01-01' })
}
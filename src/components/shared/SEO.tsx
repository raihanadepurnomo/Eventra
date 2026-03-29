import { Helmet } from 'react-helmet-async'

interface SEOProps {
  title?: string
  description?: string
  image?: string
  url?: string
  type?: 'website' | 'article'
}

const BASE_URL = 'https://eventra.raihanadepurnomo.dev'

const DEFAULT = {
  title: 'Eventra — Platform Ticketing & Manajemen Event Modern',
  description:
    'Beli, jual, dan resale tiket event secara online. ' +
    'Platform ticketing terpercaya dengan fitur resale resmi, ' +
    'Seat Social, dan dashboard lengkap untuk penyelenggara.',
  image: `${BASE_URL}/og-image.png`,
  url: BASE_URL,
}

export function SEO({ title, description, image, url, type = 'website' }: SEOProps) {
  const seoTitle = title ? `${title} | Eventra` : DEFAULT.title
  const seoDesc  = description ?? DEFAULT.description
  const seoImage = image ?? DEFAULT.image
  const seoUrl   = url ?? DEFAULT.url

  return (
    <Helmet>
      <title>{seoTitle}</title>
      <meta name="description"        content={seoDesc} />
      <meta name="robots"             content="index, follow" />
      <meta name="author"             content="Eventra" />
      <link rel="canonical"           href={seoUrl} />

      {/* Open Graph */}
      <meta property="og:type"        content={type} />
      <meta property="og:title"       content={seoTitle} />
      <meta property="og:description" content={seoDesc} />
      <meta property="og:image"       content={seoImage} />
      <meta property="og:url"         content={seoUrl} />
      <meta property="og:site_name"   content="Eventra" />
      <meta property="og:locale"      content="id_ID" />

      {/* Twitter Card */}
      <meta name="twitter:card"        content="summary_large_image" />
      <meta name="twitter:title"       content={seoTitle} />
      <meta name="twitter:description" content={seoDesc} />
      <meta name="twitter:image"       content={seoImage} />
    </Helmet>
  )
}

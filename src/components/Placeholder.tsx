import InstagramLink from './InstagramLink'

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <section className="placeholder-page">
      <p className="eyebrow">Coming soon</p>
      <h1>{title}</h1>
      <p>{note}</p>
      <InstagramLink label="Follow us on Instagram" />
    </section>
  )
}

export default Placeholder

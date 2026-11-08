import { useI18n } from '../i18n'

// Neither astronomy-engine's nor @neaps/tide-predictor's npm package ships a
// LICENSE file, so their notices are reproduced here as the MIT licence requires.
const ASTRONOMY_MIT = `MIT License

Copyright (c) 2019-2025 Don Cross <cosinekitty@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

const NEAPS_MIT = ASTRONOMY_MIT.replace('Copyright (c) 2019-2025 Don Cross <cosinekitty@gmail.com>', 'Copyright (c) 2019 Kevin Miller')

export default function Sources() {
  const { t } = useI18n()
  return (
    <div className="view">
      <section className="card">
        <h2>{t('src.title')}</h2>
        <p className="lead">{t('src.intro')}</p>
        <ul className="plain sources">
          <li>{t('src.astro')}</li>
          <li>{t('src.wmm')}</li>
          <li>{t('src.usno')}</li>
          <li>{t('src.tz')}</li>
          <li>{t('src.tides')}</li>
          <li>{t('src.eot20')}</li>
        </ul>
        <p className="muted">{t('src.disclaimer')}</p>
        <details>
          <summary>{t('src.license', { name: 'astronomy-engine' })}</summary>
          <pre className="licence">{ASTRONOMY_MIT}</pre>
        </details>
        <details>
          <summary>{t('src.license', { name: '@neaps/tide-predictor' })}</summary>
          <pre className="licence">{NEAPS_MIT}</pre>
        </details>
      </section>
    </div>
  )
}

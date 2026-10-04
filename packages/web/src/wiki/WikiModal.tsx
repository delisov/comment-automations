import type { Platform } from '@comment-automations/shared';
import { useState } from 'react';
import { wiki, wikiFooter, wikiNames } from './articles.js';

export const WikiModal = ({ platform, onClose }: { platform: Platform; onClose: () => void }) => {
  const articles = wiki[platform];
  const [index, setIndex] = useState(0);
  const article = articles[index] ?? articles[0];
  if (article === undefined) {
    return null;
  }
  return (
    <div
      className="modal-bg"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="wiki" role="dialog" aria-label={`${wikiNames[platform]} automations wiki`}>
        <div className="wnav">
          <div className="wtitle">{wikiNames[platform]} automations wiki</div>
          <div className="wsub">{articles.length} articles</div>
          {articles.map((item, i) => (
            <button
              key={item.title}
              type="button"
              className={i === index ? 'on' : ''}
              onClick={() => setIndex(i)}
            >
              {item.title}
            </button>
          ))}
        </div>
        <div className="wart" key={index}>
          <span className="wclose" role="button" aria-label="Close" onClick={onClose}>
            ✕
          </span>
          <h2>{article.title}</h2>
          <div dangerouslySetInnerHTML={{ __html: article.html }} />
          <div className="wfoot">{wikiFooter}</div>
        </div>
      </div>
    </div>
  );
};

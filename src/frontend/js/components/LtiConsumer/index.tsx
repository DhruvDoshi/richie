import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { iframeResizer } from 'iframe-resizer';
import { stringify } from 'query-string';
import { LtiConsumerContext, LtiConsumerProps } from 'types/LtiConsumer';
import { useAsyncEffect } from 'utils/useAsyncEffect';
import { handle } from 'utils/errors/handle';
import { useSession } from 'data/SessionProvider';
import { RICHIE_LTI_ANONYMOUS_USER_ID_CACHE_KEY } from 'settings';

const LtiConsumer = ({ id }: LtiConsumerProps) => {
  const { user } = useSession();
  const [context, setContext] = useState<LtiConsumerContext>();
  const formRef = useRef<HTMLFormElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const checkResponseStatus = (response: Response) => {
    if (!response.ok) {
      throw new Error(`Failed to retrieve LTI consumer context at placeholder ${id}`);
    }
    return response.json();
  };

  useAsyncEffect(async () => {
    // Do not create LTI context until session state has been retrieved.
    if (user !== undefined) {
      // We have to provide a unique user_id to generate the lti context. When user is authenticated, we use its username
      // as user_id. In the case the user is anonymous, we generate an uuid then store it into the session storage.
      // Furthermore, we provide to LTI context some "lis_person" information (id, username and email)
      // if they are available.
      let userId = user?.username || sessionStorage.getItem(RICHIE_LTI_ANONYMOUS_USER_ID_CACHE_KEY);

      if (userId === null) {
        userId = uuidv4();
        sessionStorage.setItem(RICHIE_LTI_ANONYMOUS_USER_ID_CACHE_KEY, userId);
      }

      const userInfos = {
        lis_person_contact_email_primary: user?.email,
        lis_person_name_given: user?.username,
        lis_person_sourcedid: user?.username,
        user_id: userId,
      };

      await fetch(
        `/api/v1.0/plugins/lti-consumer/${id}/context/?${stringify(userInfos, { skipNull: true })}`,
      )
        .then(checkResponseStatus)
        .then(setContext)
        .catch(handle);
    }
  }, [user]);

  useEffect(() => {
    if (context) {
      formRef.current?.submit();
      if (context.is_automatic_resizing) {
        // Retrieve and inject current component container height to prevent flickering
        // and remove aspect-ratio trick which is not compatible with iframeResizer
        const componentContainer = formRef.current?.closest('.richie-react--lti-consumer');
        iframeResizer({ minHeight: componentContainer?.clientHeight }, iframeRef.current!);
        componentContainer?.classList.remove('aspect-ratio');
        if (componentContainer?.attributes.getNamedItem('style')) {
          componentContainer?.attributes.removeNamedItem('style');
        }
      }
    }
  }, [context]);

  if (!context) return <div className="lti-consumer" />;

  return (
    <div className="lti-consumer">
      <form
        ref={formRef}
        action={context.url}
        method="POST"
        encType="application/x-www-form-urlencoded"
        target={`lti_iframe_${id}`}
      >
        {Object.entries(context.content_parameters).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      </form>
      <iframe
        ref={iframeRef}
        name={`lti_iframe_${id}`}
        title={context.url}
        src={context.url}
        allow="microphone *; camera *; midi *; geolocation *; encrypted-media *; fullscreen *"
        allowFullScreen
      />
    </div>
  );
};

export default LtiConsumer;
